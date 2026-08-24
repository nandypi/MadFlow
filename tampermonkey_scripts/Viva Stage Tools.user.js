// ==UserScript==
// @name         Viva Stage Tools
// @namespace    http://tampermonkey.net/
// @version      2026-08-24
// @description  Viva portal helper tools
// @author       You
// @match        https://viva-workflow-z5snvc5h3q-el.a.run.app/ta/viva/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ------------------------------------------------------------
    // Configuration
    // ------------------------------------------------------------

    const API_BASE = 'http://127.0.0.1:8765';

    const TOOL_ID = 'viva-tools';

    // ------------------------------------------------------------
    // Initialize
    // ------------------------------------------------------------

    function init() {
        // Prevent duplicate injection
        if (document.getElementById(TOOL_ID)) {
            return;
        }

        const container = document.querySelector('#content > .container');

        if (!container) {
            console.warn('[Viva Tools] Container not found.');
            return;
        }

        const blocks = container.children;

        // We expect:
        // blocks[0] = Student Details
        // blocks[1] = Rubrics
        //
        // Insert between them.

        const studentDetailsBlock = blocks[0];

        if (!studentDetailsBlock) {
            console.warn('[Viva Tools] Student details block not found.');
            return;
        }

        const toolsBlock = createToolsBlock();

        container.insertBefore(
            toolsBlock,
            studentDetailsBlock.nextElementSibling
        );

        console.log('[Viva Tools] Loaded.');
    }

    // ------------------------------------------------------------
    // Create Viva Tools UI
    // ------------------------------------------------------------

    function createToolsBlock() {
        const block = document.createElement('div');

        block.id = TOOL_ID;

        block.className =
            'mt-3 p-4 row bg-white shadow justify-content-center';

        block.innerHTML = `
            <div class="col-12">

                <div class="d-flex align-items-center justify-content-between mb-3">
                    <div>
                        <h5 class="mb-1 text-purple">Viva Tools</h5>
                    </div>

                    <span
                        class="badge text-bg-light border"
                        id="viva-tools-status">
                        Ready
                    </span>
                </div>

                <hr>

                <!-- Main actions -->
                <div class="row g-2">

                    <div class="col-12 col-md-6">
                        <button
                            id="viva-receive-zip"
                            type="button"
                            class="btn btn-primary w-100">
                            <span class="viva-btn-icon">📦</span>
                            <span class="viva-btn-text">Receive ZIP</span>
                        </button>
                    </div>

                    <div class="col-12 col-md-6">
                        <button
                            id="viva-copy-message"
                            type="button"
                            class="btn btn-outline-secondary w-100">
                            <span class="viva-btn-icon">📋</span>
                            <span class="viva-btn-text">Copy Message</span>
                        </button>
                    </div>

                </div>

                <!-- Marks -->
                <div class="mt-4">

                    <div class="d-flex align-items-center mb-2">
                        <span class="fw-semibold">
                            Marks
                        </span>
                    </div>

                    <div class="row g-2">

                        <div class="col-6 col-md-3">
                            <button
                                type="button"
                                class="btn btn-danger w-100 viva-mark-btn"
                                data-mark="fail">
                                ❌ Fail
                            </button>
                        </div>

                        <div class="col-6 col-md-3">
                            <button
                                type="button"
                                class="btn btn-warning w-100 viva-mark-btn"
                                data-mark="just-pass">
                                Just Pass
                            </button>
                        </div>

                        <div class="col-6 col-md-3">
                            <button
                                type="button"
                                class="btn btn-success w-100 viva-mark-btn"
                                data-mark="good">
                                Good
                            </button>
                        </div>

                        <div class="col-6 col-md-3">
                            <button
                                type="button"
                                class="btn btn-purple w-100 viva-mark-btn"
                                data-mark="best">
                                ⭐ Best
                            </button>
                        </div>

                    </div>

                </div>

            </div>
        `;

        attachEventHandlers(block);

        return block;
    }

    // ------------------------------------------------------------
    // Event handlers
    // ------------------------------------------------------------

    function attachEventHandlers(block) {

        // Receive ZIP
        const receiveZipButton =
            block.querySelector('#viva-receive-zip');


        receiveZipButton.addEventListener('click', async function () {

            setStatus('Working...', 'warning');

            receiveZipButton.disabled = true;

            try {

                // ------------------------------------------------
                // 1. Give document access
                // ------------------------------------------------

                const accessResponse = await docAccess(true);

                if (!accessResponse.ok) {
                    throw new Error(
                        'Could not give document access.'
                    );
                }

                // ------------------------------------------------
                // 2. Start ZIP flow
                // ------------------------------------------------

                const email = getStudentEmail();

                if (!email) {
                    throw new Error(
                        'Could not find student email on the page.'
                    );
                }

                const zipResponse = await fetch(
                    API_BASE + '/get-zip',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            email: email
                        })
                    }
                );

                const zipData = await zipResponse.json();

                if (!zipResponse.ok || zipData.success !== true) {
                    throw new Error(
                        'Could not start ZIP flow.'
                    );
                }

                console.log(
                    '[Viva Tools] ZIP flow started:',
                    zipData
                );

                // ------------------------------------------------
                // 3. Get and copy message
                // ------------------------------------------------

                block.querySelector('#viva-copy-message').click();

                // ------------------------------------------------
                // Success
                // ------------------------------------------------

                setButtonSuccess(
                    receiveZipButton,
                    'Ready'
                );

                setStatus(
                    'Access granted',
                    'success'
                );

            } catch (error) {

                console.error(
                    '[Viva Tools] Receive ZIP error:',
                    error
                );

                receiveZipButton.disabled = false;

                setStatus(
                    'Failed',
                    'danger'
                );

                alert(
                    'Unable to prepare Viva.\n\n' +
                    error.message
                );
            }
        });


        // Copy message
        const copyButton =
            block.querySelector('#viva-copy-message');

        copyButton.addEventListener('click', async function () {

            const response = await fetch(API_BASE+'/get-message');
            const data = await response.json();
            if (!response.ok || data.success !== true) {
                throw new Error('Could not get message from API.');
            };
            const message = data.message;
            console.log('[Viva Tools] Message received from API.');

            try {

                await navigator.clipboard.writeText(message);

                const originalHTML = copyButton.innerHTML;

                copyButton.innerHTML = '✓ Copied';
                copyButton.classList.remove(
                    'btn-outline-secondary'
                );
                copyButton.classList.add(
                    'btn-success'
                );

                setTimeout(() => {

                    copyButton.innerHTML = originalHTML;

                    copyButton.classList.remove(
                        'btn-success'
                    );

                    copyButton.classList.add(
                        'btn-outline-secondary'
                    );

                }, 1200);

            } catch (error) {

                console.error(
                    '[Viva Tools] Clipboard error:',
                    error
                );

                alert(
                    'Could not copy message to clipboard.'
                );
            }
        });


        // ------------------------------------------------------------
        // Marks
        // ------------------------------------------------------------

        const MARK_TARGETS = {
            fail: 13,
            'just-pass': 23,
            good: 33,
            best: 40
        };

        block
            .querySelectorAll('.viva-mark-btn')
            .forEach(button => {

                button.addEventListener('click', async function () {

                    const markType = this.dataset.mark;
                    const target = MARK_TARGETS[markType];

                    if (target === undefined) {
                        console.error('[Viva Tools] Unknown mark:', markType);
                        return;
                    }

                    console.log(
                        `[Viva Tools] Setting target mark: ${target}`
                    );

                    setStatus(`Setting ${target} marks...`, 'warning');

                    try {

                        const success = applyExactScore(target);

                        if (!success) {
                            throw new Error(
                                `Could not create exactly ${target} marks from the available rubrics.`
                            );
                        }

                        console.log(
                            `[Viva Tools] ${target} marks selected successfully.`
                        );

                        setStatus(
                            `${target} marks selected`,
                            'success'
                        );

                        // ------------------------------------------------
                        // Remove document access
                        // Submit ONLY if docAccess(false) succeeds
                        // ------------------------------------------------

                        console.log(
                            '[Viva Tools] Calling docAccess(false)...'
                        );

                        const response = await docAccess(false);

                        if (!response || !response.ok) {
                            throw new Error(
                                'docAccess(false) failed. Submission cancelled.'
                            );
                        }

                        console.log(
                            '[Viva Tools] docAccess(false) succeeded.'
                        );

                        setStatus(
                            `Submitting ${target} marks...`,
                            'success'
                        );

                        // Give the DOM a moment to process radio changes
                        setTimeout(() => {

                            const submitButton =
                                document.getElementById('final-submit');

                            if (!submitButton) {
                                console.error(
                                    '[Viva Tools] final-submit button not found.'
                                );

                                setStatus(
                                    'Submit button not found',
                                    'danger'
                                );

                                return;
                            }

                            console.log(
                                `[Viva Tools] Clicking submit for ${target} marks.`
                            );

                            submitButton.click();

                            watchForVivaSuccessPopup();

                        }, 0);

                    } catch (error) {

                        console.error(
                            '[Viva Tools] Marking error:',
                            error
                        );

                        setStatus(
                            'Failed',
                            'danger'
                        );

                        alert(error.message);

                        // Re-enable buttons
                        block
                            .querySelectorAll('.viva-mark-btn')
                            .forEach(btn => btn.disabled = false);
                    }

                });

            });


        // ------------------------------------------------------------
        // Get all rubric questions
        // ------------------------------------------------------------

        function getRubrics() {

            const rubrics = [];

            document
                .querySelectorAll('input[type="radio"][id$="o1"]')
                .forEach(yesRadio => {

                    const noRadio = document.getElementById(
                        yesRadio.id.replace(/o1$/, 'o2')
                    );

                    if (!noRadio) {
                        return;
                    }

                    rubrics.push({
                        yes: yesRadio,
                        no: noRadio,
                        score: Number(yesRadio.value) || 0
                    });

                });

            return rubrics;
        }


        // ------------------------------------------------------------
        // Select radio
        // ------------------------------------------------------------

        function selectRadio(radio) {

            if (!radio) {
                return;
            }

            if (!radio.checked) {
                radio.click();
            }

        }


        // ------------------------------------------------------------
        // Find exact combination of rubric scores
        // ------------------------------------------------------------

        function findExactCombination(rubrics, target) {

            /*
             * dp[sum] = list of rubric indexes used to reach that sum
             */

            const dp = new Array(target + 1).fill(null);

            dp[0] = [];

            for (let i = 0; i < rubrics.length; i++) {

                const score = rubrics[i].score;

                if (score <= 0 || score > target) {
                    continue;
                }

                // Go backwards so each rubric can only be used once
                for (let sum = target; sum >= score; sum--) {

                    if (dp[sum] !== null) {
                        continue;
                    }

                    const previous = dp[sum - score];

                    if (previous !== null) {
                        dp[sum] = [
                            ...previous,
                            i
                        ];
                    }

                }

                if (dp[target] !== null) {
                    break;
                }
            }

            return dp[target];
        }


        // ------------------------------------------------------------
        // Apply exact score
        // ------------------------------------------------------------

        function applyExactScore(target) {

            const rubrics = getRubrics();

            console.log(
                '[Viva Tools] Rubrics found:',
                rubrics.length
            );

            if (rubrics.length === 0) {
                console.error(
                    '[Viva Tools] No rubrics found.'
                );

                return false;
            }

            const combination =
                findExactCombination(rubrics, target);

            if (combination === null) {

                console.error(
                    `[Viva Tools] Cannot create exactly ${target} marks.`
                );

                return false;
            }

            // First set EVERYTHING to No / 0
            rubrics.forEach(rubric => {
                selectRadio(rubric.no);
            });

            // Then enable only the rubrics required
            combination.forEach(index => {
                selectRadio(rubrics[index].yes);
            });

            // Calculate actual selected score for verification
            let actualScore = 0;

            combination.forEach(index => {
                actualScore += rubrics[index].score;
            });

            console.log(
                '[Viva Tools] Target:',
                target,
                'Actual:',
                actualScore
            );

            console.log(
                '[Viva Tools] Selected rubrics:',
                combination.map(index => ({
                    id: rubrics[index].yes.id,
                    score: rubrics[index].score
                }))
            );

            return actualScore === target;
        }


    }

    // ------------------------------------------------------------
    // Student information
    // ------------------------------------------------------------

    function getStudentEmail() {

        const emailElement =
            document.querySelector(
                '#content > .container .text-purple'
            );

        // Better approach: find the email using @ds.study.iitm.ac.in
        const elements =
            document.querySelectorAll(
                '#content > .container h5'
            );

        for (const element of elements) {

            const text = element.textContent.trim();

            if (text.includes('@')) {
                return text;
            }
        }

        return null;
    }

    // ------------------------------------------------------------
    // FastAPI access function
    // ------------------------------------------------------------

    async function docAccess(give) {

        const email = getStudentEmail();

        if (!email) {
            throw new Error(
                'Could not find student email on the page.'
            );
        }

        console.log(
            '[Viva Tools] Document access request:',
            give ? 'GIVE' : 'REMOVE',
            '|',
            email
        );

        const response = await fetch(
            API_BASE + '/doc-access',
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json'
                },

                body: JSON.stringify({
                    email: email,
                    give: give
                })
            }
        );

        let data = null;

        try {
            data = await response.json();
        } catch (error) {
            console.error(
                '[Viva Tools] Could not parse API response:',
                error
            );
        }

        console.log(
            '[Viva Tools] doc-access response:',
            response.status,
            data
        );

        if (!response.ok || !data || data.success !== true) {
            throw new Error(
                give
                    ? 'Could not give document access.'
                    : 'Could not remove document access.'
            );
        }

        return response;
    }

    // ------------------------------------------------------------
    // UI helpers
    // ------------------------------------------------------------

    function setButtonSuccess(button, text) {

        button.disabled = true;

        button.innerHTML = `
            <span class="me-1">✓</span>
            ${text}
        `;

        button.classList.remove(
            'btn-primary'
        );

        button.classList.add(
            'btn-success'
        );
    }


    function setStatus(text, type) {

        const status =
            document.querySelector(
                '#viva-tools-status'
            );

        if (!status) {
            return;
        }

        status.textContent = text;

        status.className =
            'badge border';

        if (type === 'success') {

            status.classList.add(
                'text-bg-success'
            );

        } else if (type === 'danger') {

            status.classList.add(
                'text-bg-danger'
            );

        } else if (type === 'warning') {

            status.classList.add(
                'text-bg-warning'
            );

        } else {

            status.classList.add(
                'text-bg-light'
            );
        }
    }

    // ------------------------------------------------------------
    // Automatically click final "OK" after viva submission
    // ------------------------------------------------------------

    function watchForVivaSuccessPopup() {

        const observer = new MutationObserver(() => {

            const modal = document.querySelector('.swal-modal');

            if (!modal) {
                return;
            }

            const title =
                modal.querySelector('.swal-title');

            if (!title) {
                return;
            }

            const titleText =
                title.textContent.trim();

            if (titleText === 'Viva ended and Marks assigned !') {

                console.log(
                    '[Viva Tools] Viva success popup detected.'
                );

                const okButton =
                    modal.querySelector(
                        '.swal-button--confirm'
                    );

                if (!okButton) {
                    console.warn(
                        '[Viva Tools] OK button not found.'
                    );
                    return;
                }

                console.log(
                    '[Viva Tools] Automatically clicking OK.'
                );

                okButton.click();

                observer.disconnect();
            }

        });

        observer.observe(
            document.body,
            {
                childList: true,
                subtree: true
            }
        );

        console.log(
            '[Viva Tools] Watching for viva success popup.'
        );
    }


    // ------------------------------------------------------------
    // Start
    // ------------------------------------------------------------

    if (document.readyState === 'loading') {

        document.addEventListener(
            'DOMContentLoaded',
            init
        );

    } else {

        init();
    }

})();