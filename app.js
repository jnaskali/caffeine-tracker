(() => {
    // === Configuration & Constants ===
    const NS = "http://www.w3.org/2000/svg";
    const CX = 250, CY = 250;              // Center coordinates
    const R_IN = 172, R_OUT = 198;         // Inner and outer radii of the 24h dial
    const N = 24;                          // Number of hours
    const GAP = 0.007;                     // Gap between hour segments (in radians)

    // === Storage Helpers ===
    const getCookie = (name) => {
        const v = `; ${document.cookie}`;
        const p = v.split(`; ${name}=`);
        if (p.length === 2) return p.pop().split(';').shift();
        return null;
    };
    const setCookie = (name, val) => document.cookie = `${name}=${val}; max-age=604800; path=/`;
    const deleteCookie = (name) => document.cookie = `${name}=; max-age=0; path=/`;

    // Physics / Visuals
    let HL = parseFloat(getCookie("caffeine_hl")) || 4.5;    // Half-life of caffeine in hours
    const MAX_T = 42;                      // Max visual thickness for the caffeine graph
    const MIN_T = 0.4;                     // Min visual thickness before cutoff
    // Hours it takes for caffeine to decay from MAX_T to MIN_T
    let DECAY = HL * Math.log(MIN_T / MAX_T) / Math.log(0.5); 
    let mgPerCup = parseFloat(getCookie("caffeine_mg")) || 120; // Caffeine per cup in mg
    const R_CAFF = R_OUT + R_OUT * GAP * 2; // Base radius for rendering caffeine layers
    const STEPS = 240;                     // Curve resolution (points per graph)

    // === State ===
    let cups = [];                         // Array of added cups: { id: number, hour: number }
    let uid = 1;                           // Unique ID generator for cups
    let gCaff;                             // SVG group for caffeine graphs

    // === DOM Elements ===
    const getEl = id => document.getElementById(id);
    const svg = getEl("dial");
    const tooltip = getEl("tooltip");
    const elCenterCups = getEl("center-cups");
    const elCenterMg = getEl("center-mg");
    const elCenterDesc = getEl("center-desc");
    const elResetBtn = getEl("reset-btn");
    const infoBtn = getEl("info-btn");
    const infoModal = getEl("info-modal-overlay");
    const closeModalBtn = getEl("close-modal-btn");

    // === Math & SVG Helpers ===
    // Converts hour (0-23) to angle in radians (starts at 6 o'clock and goes clockwise)
    const ang = h => Math.PI / 2 + (h / N) * 2 * Math.PI;
    
    // Polar (angle, radius) to Cartesian (x, y) coordinates
    const pt = (a, r) => [CX + r * Math.cos(a), CY + r * Math.sin(a)];
    
    // Calculates visual thickness of caffeine at a given elapsed time (exponential decay)
    const caffT = elapsed => {
        if (elapsed < 0) return 0;
        const t = MAX_T * Math.pow(0.5, elapsed / HL);
        return t >= MIN_T ? t : 0;
    };

    // Defines sleeping hours visually (10 PM to 6 AM)
    const isSleep = h => h >= 22 || h < 6;

    // Use 4 AM as the "start of day" to logically sort cups (avoids midnight wrap-around grouping)
    const getSortTime = h => (h - 4 + 24) % 24;

    // Generates an SVG path 'd' string for an annular wedge (a clickable hour segment)
    const sector = (ri, ro, a1, a2) => {
        const largeArc = (a2 - a1) > Math.PI ? 1 : 0;
        const [p1x, p1y] = pt(a1, ro);
        const [p2x, p2y] = pt(a2, ro);
        const [p3x, p3y] = pt(a2, ri);
        const [p4x, p4y] = pt(a1, ri);
        return `M ${p1x},${p1y} A ${ro},${ro} 0 ${largeArc} 1 ${p2x},${p2y} L ${p3x},${p3y} A ${ri},${ri} 0 ${largeArc} 0 ${p4x},${p4y} Z`;
    };

    // Creates a dark blue color gradient for sleep segments based on distance from 4 AM
    const sleepFill = h => {
        const i = h >= 22 ? h - 22 : h + 2; // Normalize around 2 AM
        const d = Math.abs(i - 4) / 4;
        return `rgb(${15 + 20 * d | 0},${25 + 40 * d | 0},${55 + 50 * d | 0})`;
    };

    // Quick helper for creating an SVG group element
    const mkGroup = id => {
        const g = document.createElementNS(NS, "g");
        g.id = id;
        return g;
    };

    // === Core Logic ===

    // Initializes SVG background, segments, and event listeners
    const build = () => {
        const gBg = mkGroup("bg");
        const gS = mkGroup("segs");
        gCaff = mkGroup("caff");
        const gL = mkGroup("labels");
        
        svg.append(gBg, gS, gCaff, gL);

        // Center dark circle
        const cc = document.createElementNS(NS, "circle");
        cc.setAttribute("cx", CX);
        cc.setAttribute("cy", CY);
        cc.setAttribute("r", R_IN - 30);
        cc.setAttribute("fill", "#0f172a");
        cc.setAttribute("stroke", "#1e293b");
        cc.setAttribute("stroke-width", "1.5");
        
        // Invisible rect to catch touch/mouse events over the whole area
        const touchCatcher = document.createElementNS(NS, "rect");
        touchCatcher.setAttribute("width", "500");
        touchCatcher.setAttribute("height", "500");
        touchCatcher.setAttribute("fill", "transparent");
        gBg.append(touchCatcher, cc);

        // Render the 24 hour segments
        for (let h = 0; h < N; h++) {
            const p = document.createElementNS(NS, "path");
            p.setAttribute("d", sector(R_IN, R_OUT, ang(h) + GAP, ang(h + 1) - GAP));
            p.className.baseVal = "segment";
            p.style.fill = isSleep(h) ? sleepFill(h) : "#3b82f6";
            p.setAttribute("role", "button");
            p.setAttribute("tabindex", "0");
            p.setAttribute("aria-label", `Add cup at ${String(h).padStart(2, "0")}:00`);
            
            const add = () => addCup(h);
            p.addEventListener("click", add);
            p.addEventListener("keydown", e => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    add();
                }
            });
            gS.appendChild(p);

            // Position hour labels in the middle of each segment
            const [x, y] = pt(ang(h + 0.5), R_IN - 14);
            const t = document.createElementNS(NS, "text");
            t.setAttribute("x", x);
            t.setAttribute("y", y);
            t.setAttribute("text-anchor", "middle");
            t.setAttribute("dominant-baseline", "central");
            t.className.baseVal = "hour-label";
            t.textContent = String(h).padStart(2, "0");
            gL.appendChild(t);
        }

        // Reset tracking
        elResetBtn.addEventListener("click", () => {
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

    // Re-calculates and redraws the caffeine stacked decay graphs
    const render = () => {
        // Cleanup old graphical layers
        const existing = gCaff.querySelectorAll(".cup-layer");
        existing.forEach(el => {
            if (!cups.find(c => c.id === +el.dataset.cupId)) el.remove();
        });

        // Sort cups logically starting from 4 AM
        const sorted = [...cups].sort((a, b) => getSortTime(a.hour) - getSortTime(b.hour) || a.id - b.id);

        sorted.forEach((cup, ci) => {
            const T_ci = getSortTime(cup.hour);
            const outerPts = [];
            const innerPts = [];

            // Calculate 'STEPS' points to form the decay curve for this cup
            for (let i = 0; i <= STEPS; i++) {
                const f = i / STEPS;
                const elapsed_i = f * DECAY;
                const curr_t = T_ci + elapsed_i; // Logical time at this point of the curve
                const a = ang((curr_t + 4) % 24); // Actual clock angle

                let prev = 0; // Caffeine contribution from prior cups (for stacking)
                
                // Accumulate caffeine from all cups that occurred before `curr_t`
                for (let j = 0; j < sorted.length; j++) {
                    let T_j = getSortTime(sorted[j].hour);
                    // If the other cup is logically later in the day, treat it as from yesterday
                    if (j > ci) T_j -= 24; 
                    
                    let e = curr_t - T_j; // Time elapsed since that cup
                    // If evaluating our own cup's past contribution, start from yesterday
                    if (j === ci) e += 24; 

                    // Keep adding historical cycles of this cup until decay is complete
                    while (e <= DECAY) {
                        if (e >= 0) prev += caffT(e);
                        e += 24;
                    }
                }

                const tc = caffT(elapsed_i); // Thickness of this cup at this point
                outerPts.push(pt(a, R_CAFF + prev + tc));
                innerPts.push(pt(a, R_CAFF + prev));
            }

            // Construct the path: forward along outer edge, reverse along inner edge
            const d = `M ${outerPts.map(p => p.join(',')).join(' L ')} L ${innerPts.reverse().map(p => p.join(',')).join(' L ')} Z`;

            // Update or create the SVG path for this cup
            let el = gCaff.querySelector(`[data-cup-id="${cup.id}"]`);
            if (!el) {
                el = document.createElementNS(NS, "path");
                el.className.baseVal = "cup-layer";
                el.dataset.cupId = cup.id;
                el.addEventListener("click", e => {
                    e.stopPropagation();
                    removeCup(cup.id);
                });
            }
            
            gCaff.appendChild(el); // Re-appending preserves DOM stack order == logical sort order
            el.setAttribute("d", d);
        });
    };

    // Updates text summaries in the center of the dial
    const updateUI = () => {
        const n = cups.length;
        elCenterCups.textContent = `${n} Cup${n === 1 ? '' : 's'}`;
        
        if (n > 0) {
            elCenterMg.textContent = `${n * mgPerCup}mg caffeine`; // Dynamic mg amount
            elCenterMg.style.display = "block";
            elCenterDesc.textContent = "DAILY TOTAL";
            elResetBtn.style.display = "block";
        } else {
            elCenterMg.style.display = "none";
            elCenterDesc.textContent = "ENJOYED";
            elResetBtn.style.display = "none";
        }
    };

    // Determines time and caffeine levels at the cursor position
    const updateTooltip = (clientX, clientY) => {
        const pnt = svg.createSVGPoint();
        pnt.x = clientX;
        pnt.y = clientY;
        const svgP = pnt.matrixTransform(svg.getScreenCTM().inverse());
        
        const dx = svgP.x - CX;
        const dy = svgP.y - CY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Show tooltip if hovering outside the inner circle and there are tracked cups
        if (dist > R_IN - 16 && cups.length > 0) { 
            let a_norm = Math.atan2(dy, dx) - Math.PI / 2;
            if (a_norm < 0) a_norm += 2 * Math.PI; // Normalize angle to 0-2PI
            
            const h = (a_norm / (2 * Math.PI)) * 24; // Hovered hour
            const hover_t = getSortTime(h);
            
            let max_mg = 0;
            cups.forEach(c => {
                const c_t = getSortTime(c.hour);
                let elapsed = hover_t - c_t;
                // If hover time is logically before cup time, calculate based on yesterday's cup
                if (elapsed < 0) elapsed += 24;
                
                max_mg += mgPerCup * Math.pow(0.5, elapsed / HL);
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

    // === Event Handling ===

    let touchActive = false;
    let rAF_ID = null;

    // Debounce tooltip updates to screen refresh rate for performance
    const requestTooltipUpdate = (x, y) => {
        if (rAF_ID) cancelAnimationFrame(rAF_ID);
        rAF_ID = requestAnimationFrame(() => {
            updateTooltip(x, y);
            rAF_ID = null;
        });
    };

    svg.addEventListener("mousemove", e => {
        if (!touchActive) requestTooltipUpdate(e.clientX, e.clientY);
    });

    svg.addEventListener("mouseleave", () => {
        if (!touchActive) {
            if (rAF_ID) cancelAnimationFrame(rAF_ID);
            tooltip.style.opacity = 0;
        }
    });

    // Touch support mapping for mobile devices
    svg.addEventListener("touchstart", e => {
        touchActive = true;
        if (e.touches.length > 0) requestTooltipUpdate(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    window.addEventListener("touchmove", e => {
        if (touchActive && e.touches.length > 0) {
            requestTooltipUpdate(e.touches[0].clientX, e.touches[0].clientY);
        }
    }, { passive: true });

    const endTouch = () => {
        if (touchActive) {
            setTimeout(() => touchActive = false, 100);
        }
    };

    window.addEventListener("touchend", endTouch);
    window.addEventListener("touchcancel", endTouch);

    // Easter egg link
    document.getElementById("pi-link").addEventListener("click", e => {
        if (e.ctrlKey && e.shiftKey) {
            window.open("https://github.com/jnaskali/caffeine-tracker", "_blank");
        }
    });

    // Modal controls
    if (infoBtn && infoModal && closeModalBtn) {
        const hlInput = getEl("hl-input");
        const mgInput = getEl("mg-input");
        const cookieInfo = getEl("cookie-info");

        hlInput.value = HL;
        mgInput.value = mgPerCup;

        const updateCookieText = () => {
            if (!cookieInfo) return;
            if (getCookie("caffeine_hl") || getCookie("caffeine_mg")) {
                cookieInfo.innerHTML = '(7-day cookie present <a href="#" id="delete-cookies-btn" style="text-decoration:none" aria-label="Delete cookies" title="Delete cookies">🗑️</a>)';
                getEl("delete-cookies-btn").addEventListener("click", (e) => {
                    e.preventDefault();
                    deleteCookie("caffeine_hl");
                    deleteCookie("caffeine_mg");
                    updateCookieText();
                });
            } else {
                cookieInfo.textContent = '(saves a 7-day browser cookie)';
            }
        };

        const applySettings = () => {
            const newHL = parseFloat(hlInput.value) || 4.5;
            const newMg = parseFloat(mgInput.value) || 120;
            if (newHL !== HL || newMg !== mgPerCup) {
                HL = newHL;
                mgPerCup = newMg;
                setCookie("caffeine_hl", HL);
                setCookie("caffeine_mg", mgPerCup);
                updateCookieText();
                DECAY = HL * Math.log(MIN_T / MAX_T) / Math.log(0.5);
                render();
                updateUI();
            }
        };

        const hideModal = () => {
            infoModal.classList.add("hidden");
        };

        hlInput.addEventListener("input", applySettings);
        mgInput.addEventListener("input", applySettings);

        infoBtn.addEventListener("click", () => {
            updateCookieText();
            infoModal.classList.remove("hidden");
        });

        updateCookieText(); // Init text
        closeModalBtn.addEventListener("click", hideModal);
        infoModal.addEventListener("click", (e) => {
            if (e.target === infoModal) hideModal();
        });

        const accordions = document.querySelectorAll(".accordion");
        accordions.forEach(acc => {
            acc.addEventListener("toggle", () => {
                if (acc.open) {
                    accordions.forEach(other => {
                        if (other !== acc) other.open = false;
                    });
                }
            });
        });
    }

    if (getCookie("caffeine_hl")) setCookie("caffeine_hl", HL);
    if (getCookie("caffeine_mg")) setCookie("caffeine_mg", mgPerCup);

    // Initialize application
    build();
    updateUI(); 
})();