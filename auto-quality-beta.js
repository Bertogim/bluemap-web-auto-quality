/*
Current version: v0.1.4

Check for new versions at: https://github.com/Bertogim/bluemap-web-auto-quality/releases
Download the auto-quality.js script and add it to your bluemap server
*/

/*
(From console)
bluemapAutoQualityDebug = true;  // enable debug logging
bluemapAutoQualityDebug = false; // disable debug logging
*/


(function () {
    const REFRESH_INTERVAL_MS = 250;
    const HIRES_MIN = 60;
    const HIRES_MAX = Number(localStorage.getItem("OverrideHires")) || bluemap.settings.hiresSliderMax;
    const LOWRES_MIN = 500;
    const LOWRES_MAX = Number(localStorage.getItem("OverrideLowres")) || bluemap.settings.lowresSliderMax;
    const QUALITY_MIN = 0.4;
    const QUALITY_TARGET = 1.0;
    const QUALITY_STEP = 0.1;
    const DISTANCE_STEP_HIRES = 10;
    const DISTANCE_STEP_LOWRES = 100;

    const LOWEST_FPS = 20; //Distance will drop to minimum
    const LOW_FPS = 35; //Quality will drop to minimum
    const GOOD_FPS = 40; //Consider enough fps for a lower end machine
    const BEST_FPS = 50; //Consider minimum fps for a good end machine
    const VERYGOOD_FPS = 55; //Consider minimum fps for a top end machine

    let FPS_DECIDED_VALUE = 50 //By default 50, will change instantly

    let debug = false

    window.bluemapAutoQualityDebug = debug;
    Object.defineProperty(window, "bluemapAutoQualityDebug", {
        get() { return debug; },
        set(value) {
            debug = Boolean(value);
            console.log(`[AutoQuality] Debug mode ${debug ? "enabled" : "disabled"}`);
        }
    });
    
    let autoQualityEnabled = localStorage.getItem("autoQualityEnabled") !== "false"; // default true
    let autoHiresEnabled = localStorage.getItem("autoHiresEnabled") !== "false";     // default true
    let autoLowresEnabled = localStorage.getItem("autoLowresEnabled") !== "false";   // default true

    function createAutoButtons(qualityGroup, hiresGroup, lowresGroup) {
        if (!qualityGroup || !hiresGroup || !lowresGroup) return false;

        // Avoid duplicate buttons
        if (
            document.getElementById("auto-quality-btn") &&
            document.getElementById("auto-hires-btn") &&
            document.getElementById("auto-lowres-btn")
        ) return false;

        const autoQualityBtn = document.createElement("div");
        autoQualityBtn.id = "auto-quality-btn";
        autoQualityBtn.className = "simple-button active";
        autoQualityBtn.innerHTML = `Auto Quality `;
        autoQualityBtn.style.cursor = "pointer";

        const autoHiresBtn = document.createElement("div");
        autoHiresBtn.id = "auto-hires-btn";
        autoHiresBtn.className = "simple-button active";
        autoHiresBtn.innerHTML = `Auto HiRes `;
        autoHiresBtn.style.cursor = "pointer";

        const autoLowresBtn = document.createElement("div");
        autoLowresBtn.id = "auto-lowres-btn";
        autoLowresBtn.className = "simple-button active";
        autoLowresBtn.innerHTML = `Auto LowRes `;
        autoLowresBtn.style.cursor = "pointer";

        autoQualityBtn.classList.toggle("active", autoQualityEnabled);
        autoHiresBtn.classList.toggle("active", autoHiresEnabled);
        autoLowresBtn.classList.toggle("active", autoLowresEnabled);

        qualityGroup.appendChild(autoQualityBtn);
        hiresGroup.appendChild(autoHiresBtn);
        lowresGroup.appendChild(autoLowresBtn);

        return {
            autoQualityBtn,
            autoHiresBtn,
            autoLowresBtn
        };
    }

    function setupAutoQualityControl() {
        function safeSetData(prop, val) {
            if (bluemap.mapViewer.data[prop] !== val) {
                bluemap.mapViewer.data[prop] = val;
                bluemap.mapViewer.updateLoadedMapArea();
                bluemap.saveUserSettings();
                return true;
            }
            return false;
        }

        function adjustDistances(fps) {
            let hires = bluemap.mapViewer.data.loadedHiresViewDistance;
            let lowres = bluemap.mapViewer.data.loadedLowresViewDistance;
            let changed = false;

            if (fps < FPS_DECIDED_VALUE && fps >= LOWEST_FPS) {
                // Reduce distances more aggressively the lower the fps gets
                const fpsRatio = (FPS_DECIDED_VALUE - fps) / (FPS_DECIDED_VALUE - LOWEST_FPS); // 0..1
                const dynamicHiresStep = Math.round(DISTANCE_STEP_HIRES * (0.5 + fpsRatio * 1.5)); // 5..25
                const dynamicLowresStep = Math.round(DISTANCE_STEP_LOWRES * (0.5 + fpsRatio * 1.5)); // 50..250

                if (autoHiresEnabled && hires > HIRES_MIN) {
                    hires = Math.max(HIRES_MIN, hires - dynamicHiresStep);
                    changed = true;
                }

                if (autoLowresEnabled && lowres > LOWRES_MIN) {
                    lowres = Math.max(LOWRES_MIN, lowres - dynamicLowresStep);
                    changed = true;
                }

                if (changed) {
                    safeSetData("loadedHiresViewDistance", hires);
                    safeSetData("loadedLowresViewDistance", lowres);
                    if (debug) { console.log(`[AutoQuality] ↓ (adaptive) HIRES → ${hires}, LOWRES → ${lowres} (fps: ${fps})`) };
                }

            } else if (fps < LOWEST_FPS) {
                if (autoHiresEnabled && hires > HIRES_MIN) {
                    hires = HIRES_MIN;
                    changed = true;
                }

                if (autoLowresEnabled && lowres > LOWRES_MIN) {
                    lowres = LOWRES_MIN;
                    changed = true;
                }

                if (changed) {
                    safeSetData("loadedHiresViewDistance", hires);
                    safeSetData("loadedLowresViewDistance", lowres);
                    if (debug) { console.log(`[AutoQuality] ⬇ HIRES → ${hires}, LOWRES → ${lowres} `) };
                }
            } else if (fps > FPS_DECIDED_VALUE) {
                if (
                    autoHiresEnabled &&
                    hires < HIRES_MAX &&
                    bluemap.mapViewer.superSampling >= QUALITY_TARGET
                ) {
                    hires = Math.min(HIRES_MAX, hires + DISTANCE_STEP_HIRES);
                    changed = true;
                }

                if (
                    autoLowresEnabled &&
                    lowres < LOWRES_MAX &&
                    bluemap.mapViewer.superSampling >= QUALITY_TARGET
                ) {
                    lowres = Math.min(LOWRES_MAX, lowres + DISTANCE_STEP_LOWRES);
                    changed = true;
                }

                if (changed) {
                    safeSetData("loadedHiresViewDistance", hires);
                    safeSetData("loadedLowresViewDistance", lowres);
                    if (debug) { console.log(`[AutoQuality] ↑ HIRES → ${hires}, LOWRES → ${lowres} `) };
                }
            }
        }

        function updateQuality(fps) {
            if (!autoQualityEnabled) return;
            setTimeout(() => {
                let quality = bluemap.mapViewer.superSampling;

                if (fps > FPS_DECIDED_VALUE && quality < QUALITY_TARGET) {
                    let dynamicStep = Math.min(QUALITY_STEP + (fps - FPS_DECIDED_VALUE) * 0.012, 0.3);
                    quality = Math.min(QUALITY_TARGET, quality + dynamicStep);
                    quality = Math.round(quality * 100) / 100;

                    bluemap.mapViewer.superSampling = quality;
                    bluemap.saveUserSettings();
                    if (debug) {
                        console.log(`[AutoQuality] ↑ Quality → ${quality} (fps: ${fps}, step: ${dynamicStep.toFixed(2)
                            })`)
                    };
                } else if (
                    fps < LOW_FPS &&
                    quality > QUALITY_MIN &&
                    bluemap.mapViewer.data.loadedHiresViewDistance <= HIRES_MIN &&
                    bluemap.mapViewer.data.loadedLowresViewDistance <= LOWRES_MIN
                ) {
                    let dropStep = Math.min(QUALITY_STEP * 2 + (LOW_FPS - fps) * 0.01, 0.3);
                    quality = Math.max(QUALITY_MIN, quality - dropStep);
                    quality = Math.round(quality * 100) / 100;

                    bluemap.mapViewer.superSampling = quality;
                    bluemap.saveUserSettings();
                    if (debug) {
                        console.log(`[AutoQuality] ↓ Quality → ${quality} (fps: ${fps}, step: ${dropStep.toFixed(2)
                            })`)
                    };
                }
            }, 0);
        }

        let lastTime = performance.now();
        let frameCount = 0;
        let fps = 60;

        let animationFrameId = null;
        let isAnimating = false;

        function animate() {
            if (document.visibilityState !== "visible") return;

            // Marca que estamos animando
            isAnimating = true;

            frameCount++;
            const now = performance.now();

            if (now - lastTime >= REFRESH_INTERVAL_MS) {
                fps = Math.round((frameCount * 1000) / (now - lastTime));
                frameCount = 0;
                lastTime = now;

                const hires = bluemap.mapViewer.data.loadedHiresViewDistance;

                FPS_DECIDED_VALUE = hires > 160 ? VERYGOOD_FPS : hires > 120 ? BEST_FPS : hires > 0 ? GOOD_FPS : FPS_DECIDED_VALUE;

                adjustDistances(fps);
                updateQuality(fps);
            }

            animationFrameId = requestAnimationFrame(animate);
        }

        function startAnimationLoop() {
                lastTime = performance.now();
                frameCount = 0;
                animationFrameId = requestAnimationFrame(animate);
        }

        function stopAnimationLoop() {
            if (animationFrameId !== null) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            isAnimating = false;
        }

        // Hook into visibility API
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
                console.log("[AutoQuality] Resumed");
                setTimeout(() => {

                    startAnimationLoop();
                }, 100);
            } else {
                console.log("[AutoQuality] Paused");
                stopAnimationLoop();
            }
        });

        startAnimationLoop();


        console.log("Auto quality initiated.")

        // Periodically try to insert buttons if UI is visible
        setInterval(() => {
            const qualityGroup = document.querySelector("#app > div.side-menu > div.content > div > div.group:nth-child(3) > div");
            const hiresGroup = document.querySelector("#app > div.side-menu > div.content > div > div.group:nth-child(4) > div");
            const lowresGroup = document.querySelector("#app > div.side-menu > div.content > div > div.group:nth-child(4) > div");

            const buttons = createAutoButtons(qualityGroup, hiresGroup, lowresGroup);
            if (buttons) {
                buttons.autoQualityBtn.addEventListener("click", () => {
                    autoQualityEnabled = !autoQualityEnabled;
                    buttons.autoQualityBtn.classList.toggle("active", autoQualityEnabled);
                    localStorage.setItem("autoQualityEnabled", autoQualityEnabled);
                });
                buttons.autoHiresBtn.addEventListener("click", () => {
                    autoHiresEnabled = !autoHiresEnabled;
                    buttons.autoHiresBtn.classList.toggle("active", autoHiresEnabled);
                    localStorage.setItem("autoHiresEnabled", autoHiresEnabled);

                });
                buttons.autoLowresBtn.addEventListener("click", () => {
                    autoLowresEnabled = !autoLowresEnabled;
                    buttons.autoLowresBtn.classList.toggle("active", autoLowresEnabled);

                    localStorage.setItem("autoLowresEnabled", autoLowresEnabled);
                });
                if (debug) { console.log("[AutoQuality] Auto buttons injected.") };
            }
        }, 1000); // Check every second
    }

    const waitForBlueMap = setInterval(() => {
        if (
            window.bluemap &&
            bluemap.mapViewer &&
            typeof bluemap.mapViewer.superSampling === "number" &&
            bluemap.mapViewer.data &&
            typeof bluemap.mapViewer.data.loadedHiresViewDistance === "number" &&
            typeof bluemap.mapViewer.data.loadedLowresViewDistance === "number"
        ) {
            clearInterval(waitForBlueMap);
            setupAutoQualityControl();
        }
    }, 200);
})();
