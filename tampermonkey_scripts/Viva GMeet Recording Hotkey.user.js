// ==UserScript==
// @name         Viva GMeet Recording Hotkey
// @match        https://meet.google.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const params = new URLSearchParams(window.location.search);

    // only for the second google account mail meetings
    if (params.get('authuser') === '1') {

        // if gmeet join page then mute the camera and mic then Join meeting automatically
        //////////////////////////


(async () => {

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function getJoinButton() {
        return [...document.querySelectorAll("button")]
            .find(btn =>
                btn.textContent.trim() === "Join now" ||
                btn.getAttribute("aria-label")?.startsWith("Join now")
            );
    }

    function getMicButton() {
        return [...document.querySelectorAll('div[role="button"][data-is-muted]')]
            .find(btn =>
                btn.getAttribute("aria-label")?.toLowerCase().includes("microphone")
            );
    }

    function getCamButton() {
        return [...document.querySelectorAll('div[role="button"][data-is-muted]')]
            .find(btn =>
                btn.getAttribute("aria-label")?.toLowerCase().includes("camera")
            );
    }

    // Wait up to 15 seconds for Join button
    let joinBtn = null;

    for (let i = 0; i < 75; i++) {
        joinBtn = getJoinButton();
        if (joinBtn) break;
        await sleep(200);
    }

    if (!joinBtn) {
        console.log("Join button not found.");
        return;
    }

    console.log("Join button found.");

    // Mute mic
    while (true) {
        const mic = getMicButton();

        if (!mic) {
            await sleep(200);
            continue;
        }

        if (mic.dataset.isMuted === "true")
            break;

        console.log("Muting microphone...");
        mic.click();

        await sleep(500);
    }

    // Turn off camera
    while (true) {
        const cam = getCamButton();

        if (!cam) {
            await sleep(200);
            continue;
        }

        if (cam.dataset.isMuted === "true")
            break;

        console.log("Turning camera off...");
        cam.click();

        await sleep(500);
    }

    // Re-find Join button (Meet recreates it)
    joinBtn = getJoinButton();

    if (!joinBtn) {
        console.log("Join button disappeared.");
        return;
    }

    console.log("Joining meeting...");
    joinBtn.click();

})();


        ///////////////////////////////////////////////

        // wait for key press
        document.addEventListener("keydown", e => {

            if (e.ctrlKey && e.shiftKey && e.code === "KeyZ") {
                e.preventDefault();
                startRecording();
            }

        });

    }

    function waitFor(fn, timeout = 10000) {
        return new Promise(resolve => {
            const start = Date.now();

            (function poll() {
                const el = fn();
                if (el) return resolve(el);

                if (Date.now() - start > timeout)
                    return resolve(null);

                requestAnimationFrame(poll);
            })();
        });
    }

    function clickReal(el) {
        if (!el) return;

        el.scrollIntoView({
            block: "center",
            inline: "center"
        });

        [
            "pointerdown",
            "mousedown",
            "pointerup",
            "mouseup",
            "click"
        ].forEach(type => {
            el.dispatchEvent(new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window
            }));
        });
    }

    async function closeRecordingPanel() {

    const closeBtn = await waitFor(() => {
        const panel = document.querySelector("#ME4pNd");
        if (!panel) return null;

        return panel.querySelector('button[aria-label="Close"]');
    }, 3000);

    if (!closeBtn) {
        console.log("Close button not found");
        return;
    }

    console.log("Closing recording panel...");
    clickReal(closeBtn);
    }

    let recordingBusy = false;

    async function startRecording() {

        recordingBusy = true;

        try {

            console.log("1. Opening menu...");

            const menu = await waitFor(() =>
                document.querySelector('button[aria-label="More options"]')
            );

            if (!menu) return console.log("Menu button not found");

            clickReal(menu);

            console.log("2. Waiting for Recording...");

            const recording = await waitFor(() =>
                [...document.querySelectorAll('li[jsname="wcuPXe"]')]
                    .find(x => x.textContent.includes("Recording"))
            );

            if (!recording)
                return console.log("Recording option not found");

            clickReal(recording);

            console.log("3. Waiting for recording panel...");

            const actionBtn = await waitFor(() => {
                return document.querySelector(
                    'button[aria-label="Start recording"], button[aria-label="Stop recording"]'
                );
            });

            if (!actionBtn) {
                console.log("Recording panel button not found");
                return;
            }

            const action = actionBtn.getAttribute("aria-label");

            console.log("Action:", action);

            clickReal(actionBtn);

            // Give meet a moment to process the click
            await new Promise(r => setTimeout(r, 100));
            await closeRecordingPanel();

            if (action === "Start recording") {

                console.log("Waiting for Start confirmation...");

                const confirm = await waitFor(() =>
                    document.querySelector(
                        'button[data-mdc-dialog-action="A9Emjd"]'
                    )
                );

                if (!confirm) {
                    console.log("Start confirmation not found");
                    return;
                }

                clickReal(confirm);

                console.log("Recording started.");

            } else {

                console.log("Waiting for Stop confirmation...");

                const confirm = await waitFor(() =>
                    [...document.querySelectorAll('div[role="dialog"] button')]
                        .find(btn => btn.textContent.trim() === "Stop recording")
                );

                if (!confirm) {
                    console.log("Stop confirmation not found");
                    return;
                }

                clickReal(confirm);

                console.log("Recording stopped.");
            }

        } finally {
            recordingBusy = false;
        }
    }

})();