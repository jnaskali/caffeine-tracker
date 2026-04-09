(() => {
    const NS = "http://www.w3.org/2000/svg";
    const CX = 250, CY = 250;
    const R_IN = 172, R_OUT = 192;
    const MAX_T = 42;
    const HL = 5;
    const MIN_T = 0.4;
    const DECAY = HL * Math.log(MIN_T / MAX_T) / Math.log(0.5);
    const N = 24;
    const GAP = 0.007;
    const STEPS = 240;

    let cups = [];
    let uid = 1;
    const svg = document.getElementById("dial");
    const tooltip = document.getElementById("tooltip");

    const ang = h => Math.PI / 2 + (h / N) * 2 * Math.PI;
    const pt = (a, r) => [CX + r * Math.cos(a), CY + r * Math.sin(a)];
    
    const caffT = elapsed => {
        if (elapsed < 0) return 0;
        const t = MAX_T * Math.pow(0.5, elapsed / HL);
        return t >= MIN_T ? t : 0;
    };

    const isSleep = h => h >= 22 || h < 6;

    // Use 4am as the "start of day" for logical sorting
    const getSortTime = h => (h - 4 + 24) % 24;

    const sector = (ri, ro, a1, a2) => {
        const largeArc = (a2 - a1) > Math.PI ? 1 : 0;
        return `M ${pt(a1, ro)[0]},${pt(a1, ro)[1]} A ${ro},${ro} 0 ${largeArc} 1 ${pt(a2, ro)[0]},${pt(a2, ro)[1]} L ${pt(a2, ri)[0]},${pt(a2, ri)[1]} A ${ri},${ri} 0 ${largeArc} 0 ${pt(a1, ri)[0]},${pt(a1, ri)[1]} Z`;
    };

    const sleepFill = h => {
        const i = h >= 22 ? h - 22 : h + 2;
        const d = Math.abs(i - 4) / 4;
        return `rgb(${15 + 20 * d | 0},${25 + 40 * d | 0},${55 + 50 * d | 0})`;
    };

    const mkGroup = id => {
        const g = document.createElementNS(NS, "g");
        g.id = id;
        return g;
    };

    const build = () => {
        ["bg", "segs", "caff", "labels"].forEach(id => svg.appendChild(mkGroup(id)));

        const gBg = document.getElementById("bg");
        const gS = document.getElementById("segs");
        const gL = document.getElementById("labels");

        const cc = document.createElementNS(NS, "circle");
        cc.setAttribute("cx", CX);
        cc.setAttribute("cy", CY);
        cc.setAttribute("r", R_IN - 30);
        cc.setAttribute("fill", "#0f172a");
        cc.setAttribute("stroke", "#1e293b");
        cc.setAttribute("stroke-width", "1.5");
        
        const touchCatcher = document.createElementNS(NS, "rect");
        touchCatcher.setAttribute("width", "500");
        touchCatcher.setAttribute("height", "500");
        touchCatcher.setAttribute("fill", "transparent");
        gBg.appendChild(touchCatcher);
        gBg.appendChild(cc);

        for (let h = 0; h < N; h++) {
            const p = document.createElementNS(NS, "path");
            p.setAttribute("d", sector(R_IN, R_OUT, ang(h) + GAP, ang(h + 1) - GAP));
            p.classList.add("segment");
            p.style.fill = isSleep(h) ? sleepFill(h) : "#3b82f6";
            p.addEventListener("click", () => addCup(h));
            gS.appendChild(p);

            const pos = pt(ang(h + 0.5), R_IN - 14);
            const t = document.createElementNS(NS, "text");
            t.setAttribute("x", pos[0]);
            t.setAttribute("y", pos[1]);
            t.setAttribute("text-anchor", "middle");
            t.setAttribute("dominant-baseline", "central");
            t.classList.add("hour-label");
            t.textContent = String(h).padStart(2, "0");
            gL.appendChild(t);
        }

        document.getElementById("reset-btn").addEventListener("click", () => {
            cups = [];
            render();
            updateUI();
        });
    };

    const addCup = hour => {
        cups.push({ id: uid++, hour });
        render();
        updateUI();
    };

    const removeCup = id => {
        cups = cups.filter(c => c.id !== id);
        render();
        updateUI();
    };

    const render = () => {
        const g = document.getElementById("caff");

        const existing = g.querySelectorAll(".cup-layer");
        existing.forEach(el => {
            if (!cups.find(c => c.id === +el.dataset.cupId)) el.remove();
        });

        const sorted = [...cups].sort((a, b) => getSortTime(a.hour) - getSortTime(b.hour) || a.id - b.id);

        sorted.forEach((cup, ci) => {
            const T_ci = getSortTime(cup.hour);
            const outerPts = [];
            const innerPts = [];

            for (let i = 0; i <= STEPS; i++) {
                const f = i / STEPS;
                const elapsed_i = f * DECAY;
                const curr_t = T_ci + elapsed_i;
                const a = ang((curr_t + 4) % 24);

                let prev = 0;
                for (let j = 0; j < sorted.length; j++) {
                    let T_j = getSortTime(sorted[j].hour);
                    if (j > ci) T_j -= 24;
                    
                    let e = curr_t - T_j;
                    if (j === ci) e += 24; // skip current lap

                    while (e <= DECAY) {
                        if (e >= 0) prev += caffT(e);
                        e += 24;
                    }
                }

                const tc = caffT(elapsed_i);
                outerPts.push(pt(a, R_OUT + prev + tc));
                innerPts.push(pt(a, R_OUT + prev));
            }

            let d = `M ${outerPts[0][0]},${outerPts[0][1]}`;
            for (let i = 1; i < outerPts.length; i++) d += ` L ${outerPts[i][0]},${outerPts[i][1]}`;
            for (let i = innerPts.length - 1; i >= 0; i--) d += ` L ${innerPts[i][0]},${innerPts[i][1]}`;
            d += " Z";

            let el = g.querySelector(`[data-cup-id="${cup.id}"]`);
            if (!el) {
                el = document.createElementNS(NS, "path");
                el.classList.add("cup-layer");
                el.dataset.cupId = cup.id;
                el.addEventListener("click", e => {
                    e.stopPropagation();
                    removeCup(cup.id);
                });
            }
            
            g.appendChild(el); // Re-append guarantees SVG stacking order matches sort order
            el.setAttribute("d", d);
        });
    };

    const updateUI = () => {
        const n = cups.length;
        document.getElementById("center-cups").textContent = `${n} Cup${n === 1 ? '' : 's'}`;
        
        let total_mg = n * 120;
        if (n > 0) {
            document.getElementById("center-mg").innerHTML = `${total_mg}mg caffeine`;
            document.getElementById("center-mg").style.display = "block";
            document.getElementById("center-desc").textContent = "IN SYSTEM";
            document.getElementById("reset-btn").style.display = "block";
        } else {
            document.getElementById("center-mg").style.display = "none";
            document.getElementById("center-desc").textContent = "TRACKED";
            document.getElementById("reset-btn").style.display = "none";
        }
    };

    const updateTooltip = (clientX, clientY) => {
        const pt = svg.createSVGPoint();
        pt.x = clientX;
        pt.y = clientY;
        const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
        
        const dx = svgP.x - CX;
        const dy = svgP.y - CY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > R_IN - 16 && cups.length > 0) { 
            let a_norm = Math.atan2(dy, dx) - Math.PI / 2;
            if (a_norm < 0) a_norm += 2 * Math.PI;
            
            const h = (a_norm / (2 * Math.PI)) * 24;
            const hover_t = getSortTime(h);
            
            let max_mg = 0;
            cups.forEach(c => {
                const c_t = getSortTime(c.hour);
                let elapsed = hover_t - c_t;
                if (elapsed < 0) elapsed += 24;
                
                max_mg += 120 * Math.pow(0.5, elapsed / HL);
            });
            
            if (max_mg >= 0.5) {
                tooltip.style.opacity = 1;
                tooltip.style.left = clientX + 'px';
                tooltip.style.top = clientY + 'px';
                const hh = Math.floor(h);
                const mm = Math.floor((h % 1) * 60);
                tooltip.innerHTML = `Time: <strong>${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}</strong><br>Caffeine: <strong>${Math.round(max_mg)} mg</strong>`;
            } else {
                tooltip.style.opacity = 0;
            }
        } else {
            tooltip.style.opacity = 0;
        }
    };

    let touchActive = false;

    svg.addEventListener("mousemove", e => {
        if (!touchActive) updateTooltip(e.clientX, e.clientY);
    });

    svg.addEventListener("mouseleave", () => {
        if (!touchActive) tooltip.style.opacity = 0;
    });

    svg.addEventListener("touchstart", e => {
        touchActive = true;
        if (e.touches.length > 0) updateTooltip(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    window.addEventListener("touchmove", e => {
        if (touchActive && e.touches.length > 0) {
            updateTooltip(e.touches[0].clientX, e.touches[0].clientY);
        }
    }, { passive: true });

    const endTouch = () => {
        if (touchActive) {
            tooltip.style.opacity = 0;
            setTimeout(() => touchActive = false, 100);
        }
    };

    window.addEventListener("touchend", endTouch);
    window.addEventListener("touchcancel", endTouch);

    document.getElementById("pi-link").addEventListener("click", e => {
        if (e.ctrlKey && e.shiftKey) {
            window.open("https://github.com/jnaskali/caffeine-tracker", "_blank");
        }
    });

    build();
    updateUI(); // Run once to set initial text states correctly
})();