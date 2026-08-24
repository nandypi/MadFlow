// ==UserScript==
// @name         Viva Google Auto Login
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Auto-open Viva Google login and select the configured IITM account
// @match        https://accounts.google.com/*
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// ==/UserScript==

(async function () {
    'use strict';

    const VIVA_ORIGIN =
        'https://viva-workflow-z5snvc5h3q-el.a.run.app';

    const VIVA_CLIENT_ID =
        '232014885172-3l9ji7v31do4ivrdcnrettpbu1v9bsln.apps.googleusercontent.com';

    const MY_EMAIL =
        '22f3002857@ds.study.iitm.ac.in';

    // Only trust an "armed" login for this many milliseconds.
    const ARM_TIMEOUT = 30_000;


    // ============================================================
    // CASE 1:
    // GOOGLE GSI BUTTON IFRAME EMBEDDED INSIDE VIVA
    // ============================================================

    if (
        location.pathname.startsWith('/gsi/button')
    ) {
        console.log('[Viva AutoLogin] Google GSI iframe');

        let referrerOrigin = '';

        try {
            referrerOrigin =
                new URL(document.referrer).origin;
        } catch {}

        const clientId =
            new URL(location.href)
                .searchParams
                .get('client_id');


        // Make sure this button genuinely belongs to Viva.
        if (
            referrerOrigin !== VIVA_ORIGIN ||
            clientId !== VIVA_CLIENT_ID
        ) {
            console.log(
                '[Viva AutoLogin] Not Viva. Ignoring.'
            );

            return;
        }


        console.log(
            '✅ [Viva AutoLogin] Confirmed Viva Google button'
        );


        // Wait for Google's personalized button.
        const timer = setInterval(async () => {

            const button =
                document.querySelector(
                    '#container-div [role="button"]'
                );

            if (!button) {
                return;
            }

            clearInterval(timer);


            const text =
                button.innerText ||
                button.textContent ||
                '';


            console.log(
                '[Viva AutoLogin] Button:',
                text
            );


            // Optional extra safety check:
            // only continue if this button already shows our email.
            if (!text.includes(MY_EMAIL)) {

                console.log(
                    '❌ [Viva AutoLogin] Expected account not shown'
                );

                return;
            }


            /*
             * ARM the next Google account chooser.
             *
             * This allows the Google popup script to know that
             * this login was initiated specifically by Viva.
             */
            await GM_setValue(
                'vivaLoginArmed',
                Date.now()
            );


            console.log(
                '🔥 [Viva AutoLogin] Opening Google login'
            );


            button.click();

        }, 100);


        setTimeout(
            () => clearInterval(timer),
            10000
        );

        return;
    }


    // ============================================================
    // CASE 2:
    // GOOGLE ACCOUNT CHOOSER POPUP
    // ============================================================

    console.log(
        '[Viva AutoLogin] Google page:',
        location.href
    );


    const armedAt =
        await GM_getValue(
            'vivaLoginArmed',
            0
        );


    const age =
        Date.now() - armedAt;


    // Don't touch Google unless Viva armed us recently.
    if (
        !armedAt ||
        age < 0 ||
        age > ARM_TIMEOUT
    ) {

        console.log(
            '[Viva AutoLogin] Not armed by Viva. Ignoring Google page.'
        );

        return;
    }


    console.log(
        '✅ [Viva AutoLogin] Recent Viva login detected'
    );


    // ============================================================
    // WAIT FOR ACCOUNT LIST
    // ============================================================

    const accountTimer = setInterval(
        async () => {

            const account =
                document.querySelector(
                    `[data-identifier="${CSS.escape(MY_EMAIL)}"]` +
                    `[data-button-type="multipleChoiceIdentifier"]`
                );


            if (!account) {
                return;
            }


            clearInterval(accountTimer);


            console.log(
                '✅ [Viva AutoLogin] Account found:',
                account.dataset.identifier
            );


            /*
             * Delete the flag BEFORE clicking.
             *
             * This prevents another unrelated Google page from
             * accidentally reusing the authorization window.
             */
            await GM_deleteValue(
                'vivaLoginArmed'
            );


            console.log(
                '🔥 [Viva AutoLogin] Selecting IITM account'
            );


            account.click();

        },
        100
    );


    setTimeout(
        () => clearInterval(accountTimer),
        10000
    );

})();