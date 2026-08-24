// ==UserScript==
// @name         Viva Table Tools
// @namespace    http://tampermonkey.net/
// @version      0.0
// @description  Hide/unhide completed rows and delete slots without page reload
// @match        https://viva-workflow-z5snvc5h3q-el.a.run.app/ta/
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // Prevent accidental double installation.
    if (window.__vivaTaTableToolsInstalled) return;
    window.__vivaTaTableToolsInstalled = true;

    const STORAGE_KEY = 'viva-ta-hidden-rows';

    let dt;
    let table;
    let hiddenKeys = loadHiddenKeys();

    // normal = hide rows stored as hidden
    // hidden = show ONLY hidden rows
    let viewMode = 'normal';

    let hiddenToggleButton = null;

    // ------------------------------------------------------------
    // Wait until the website has initialized DataTables
    // ------------------------------------------------------------

    let attempts = 0;

    const initTimer = setInterval(() => {
        attempts++;

        if (
            window.jQuery &&
            jQuery.fn &&
            jQuery.fn.dataTable &&
            jQuery.fn.dataTable.isDataTable('#my-table')
        ) {
            clearInterval(initTimer);
            init();
            return;
        }

        if (attempts >= 200) {
            clearInterval(initTimer);
            console.warn('[Viva TA Tools] DataTable was not found.');
        }
    }, 100);


    // ------------------------------------------------------------
    // Initialize
    // ------------------------------------------------------------

    function init() {
        console.log('[Viva TA Tools] Initializing...');

        table = document.querySelector('#my-table');
        dt = jQuery('#my-table').DataTable();

        // Add our metadata/buttons before filtering starts.
        decorateAllRows();

        // Custom DataTables filter for hidden rows.
        installHiddenRowFilter();

        // Add "Hidden rows" button inside the first wrapper row.
        createHiddenRowsToolbar();

        // Handle Hide / Unhide / Delete.
        installTableClickHandler();

        // Re-decorate if DataTables redraws.
        jQuery('#my-table').on('draw.dt.vivaTaTools', function () {
            decorateAllRows();
            updateHiddenToolbar();
        });

        // Show all DataTables rows.
        dt.page.len(-1).draw();

        updateHiddenToolbar();

        console.log('[Viva TA Tools] Ready.');
    }


    // ============================================================
    // HIDE / UNHIDE
    // ============================================================

    function decorateAllRows() {
        dt.rows().nodes().each(function (tr) {
            decorateRow(tr);
        });
    }


    function decorateRow(tr) {
        if (!tr || !tr.cells || tr.cells.length < 6) return;

        const actionCell = tr.cells[5];

        // --------------------------------------------------------
        // A row is hideable ONLY when it contains:
        //
        // 1. "No Action Needed"
        //
        // OR
        //
        // 2. "See Details"
        // --------------------------------------------------------

        const noActionNeeded =
            /No Action Needed/i.test(actionCell.textContent || '');

        const detailsLink =
            actionCell.querySelector(
                'a.btn-warning[href*="/ta/booking/slot/"]'
            );

        const hideEligible = Boolean(
            noActionNeeded || detailsLink
        );

        tr.dataset.tmHideEligible =
            hideEligible ? '1' : '0';

        if (!hideEligible) {
            return;
        }

        // Generate a stable ID for this row.
        if (!tr.dataset.tmHideKey) {
            tr.dataset.tmHideKey = getRowKey(tr);
        }

        // Add Hide / Unhide button if it doesn't exist.
        let button =
            actionCell.querySelector('.tm-row-hide-toggle');

        if (!button) {
            button = document.createElement('button');

            button.type = 'button';

            button.className =
                'btn btn-sm btn-outline-secondary ' +
                'tm-row-hide-toggle ms-2';

            button.style.marginLeft = '8px';

            actionCell.appendChild(button);
        }

        updateRowHideButton(tr);
    }


    function getRowKey(tr) {
        const detailsLink =
            tr.querySelector(
                'a[href*="/ta/booking/slot/"]'
            );

        // Best key: booking slot ID.
        if (detailsLink) {
            const match =
                detailsLink
                    .getAttribute('href')
                    ?.match(/\/ta\/booking\/slot\/(\d+)/);

            if (match) {
                return `booking:${match[1]}`;
            }
        }

        /*
         * "No Action Needed" rows do not appear to expose
         * a slot ID in the HTML.
         *
         * Therefore create a stable signature from:
         *
         * Project
         * Date
         * Time
         * Status
         *
         * Do NOT use the first "#" column because that can
         * change after rows are deleted.
         */

        const project = normalizeText(tr.cells[1]?.textContent);
        const date    = normalizeText(tr.cells[2]?.textContent);
        const time    = normalizeText(tr.cells[3]?.textContent);
        const status  = normalizeText(tr.cells[4]?.textContent);

        return [
            'row',
            project,
            date,
            time,
            status
        ].join('|');
    }


    function updateRowHideButton(tr) {
        const button =
            tr.querySelector('.tm-row-hide-toggle');

        if (!button) return;

        const key = tr.dataset.tmHideKey;
        const isHidden = hiddenKeys.has(key);

        if (isHidden) {
            button.textContent = 'Unhide';

            button.classList.remove(
                'btn-outline-secondary'
            );

            button.classList.add(
                'btn-outline-success'
            );
        } else {
            button.textContent = 'Hide';

            button.classList.remove(
                'btn-outline-success'
            );

            button.classList.add(
                'btn-outline-secondary'
            );
        }
    }


    function installHiddenRowFilter() {
        jQuery.fn.dataTable.ext.search.push(
            function (settings, data, dataIndex) {

                // Don't affect any other DataTable on the page.
                if (settings.nTable !== table) {
                    return true;
                }

                const tr =
                    settings.aoData[dataIndex]?.nTr;

                if (!tr) {
                    return true;
                }

                const eligible =
                    tr.dataset.tmHideEligible === '1';

                const key =
                    tr.dataset.tmHideKey;

                const isHidden =
                    eligible &&
                    key &&
                    hiddenKeys.has(key);

                // --------------------------------------------
                // Hidden view:
                // show ONLY hidden rows.
                // --------------------------------------------

                if (viewMode === 'hidden') {
                    return isHidden;
                }

                // --------------------------------------------
                // Normal view:
                // hide hidden rows.
                // --------------------------------------------

                return !isHidden;
            }
        );
    }


    // ============================================================
    // HIDDEN ROWS TOOLBAR
    // ============================================================

function createHiddenRowsToolbar() {
    let host = document.querySelector('#my-table_wrapper');

    if (!host) {
        console.warn('[Viva TA Tools] #my-table_wrapper not found');
        return;
    }

    // Clear anything we previously added.
    document.querySelector('#tm-hidden-toolbar')?.remove();

    const toolbar = document.createElement('div');
    toolbar.id = 'tm-hidden-toolbar';

    toolbar.innerHTML = `
        <div class="tm-view-control">
            <span class="tm-view-label">View</span>

            <div class="btn-group btn-group-sm" role="group">
                <button
                    type="button"
                    id="tm-view-active"
                    class="btn btn-primary"
                >
                    Active
                </button>

                <button
                    type="button"
                    id="tm-view-hidden"
                    class="btn btn-outline-secondary"
                >
                    Hidden
                    <span
                        id="tm-hidden-count"
                        class="badge bg-secondary ms-1"
                    >0</span>
                </button>
            </div>
        </div>
    `;

    host.prepend(toolbar);

    // Add CSS once.
    if (!document.querySelector('#tm-table-tools-css')) {
        const style = document.createElement('style');

        style.id = 'tm-table-tools-css';

        style.textContent = `
            #tm-hidden-toolbar {
                height: 100%;
                display: flex;
                align-items: center;
                padding: 4px 0;
            }

            #tm-hidden-toolbar .tm-view-control {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            #tm-hidden-toolbar .tm-view-label {
                font-size: 0.875rem;
                font-weight: 500;
                color: #6c757d;
            }

            #tm-hidden-toolbar .btn {
                min-width: 70px;
            }

            #tm-hidden-toolbar .badge {
                vertical-align: middle;
            }

            /*
             * Vertically align all 3 DataTables controls.
             */
            #my-table_wrapper > .row:first-child > div {
                display: flex;
                align-items: center;
            }

            #my-table_wrapper .dataTables_length,
            #my-table_wrapper .dataTables_filter {
                width: 100%;
            }

            #my-table_wrapper .dataTables_filter {
                text-align: right;
            }

            /*
             * Slightly nicer Hide / Unhide row buttons.
             */
            #my-table .tm-row-hide-toggle {
                margin-left: 6px !important;
                min-width: 62px;
            }

            /*
             * Mobile layout
             */
            @media (max-width: 767px) {
                #tm-hidden-toolbar {
                    justify-content: center;
                    margin-bottom: 8px;
                }

                #my-table_wrapper > .row:first-child > div {
                    justify-content: center;
                    margin-bottom: 6px;
                }

                #my-table_wrapper .dataTables_filter {
                    text-align: center;
                }
            }
        `;

        document.head.appendChild(style);
    }

    document
        .querySelector('#tm-view-active')
        .addEventListener('click', () => {
            if (viewMode === 'normal') return;

            viewMode = 'normal';

            updateHiddenToolbar();
            dt.draw(false);
        });

    document
        .querySelector('#tm-view-hidden')
        .addEventListener('click', () => {
            if (countCurrentHiddenRows() === 0) return;

            if (viewMode === 'hidden') return;

            viewMode = 'hidden';

            updateHiddenToolbar();
            dt.draw(false);
        });

    updateHiddenToolbar();
}
function updateHiddenToolbar() {
    if (!dt) return;

    const activeButton =
        document.querySelector('#tm-view-active');

    const hiddenButton =
        document.querySelector('#tm-view-hidden');

    const hiddenCount =
        document.querySelector('#tm-hidden-count');

    if (
        !activeButton ||
        !hiddenButton ||
        !hiddenCount
    ) {
        return;
    }

    const count = countCurrentHiddenRows();

    hiddenCount.textContent = count;

    // Disable Hidden when there aren't any.
    hiddenButton.disabled = count === 0;

    if (viewMode === 'hidden') {
        // Active
        activeButton.classList.remove('btn-primary');
        activeButton.classList.add('btn-outline-secondary');

        // Hidden
        hiddenButton.classList.remove('btn-outline-secondary');
        hiddenButton.classList.add('btn-primary');

        hiddenCount.classList.remove('bg-secondary');
        hiddenCount.classList.add('bg-light', 'text-dark');

    } else {
        // Active
        activeButton.classList.remove('btn-outline-secondary');
        activeButton.classList.add('btn-primary');

        // Hidden
        hiddenButton.classList.remove('btn-primary');
        hiddenButton.classList.add('btn-outline-secondary');

        hiddenCount.classList.remove(
            'bg-light',
            'text-dark'
        );

        hiddenCount.classList.add('bg-secondary');
    }
}


    function countCurrentHiddenRows() {
        let count = 0;

        dt.rows().nodes().each(function (tr) {
            if (
                tr.dataset.tmHideEligible === '1' &&
                hiddenKeys.has(tr.dataset.tmHideKey)
            ) {
                count++;
            }
        });

        return count;
    }


    // ============================================================
    // CLICK HANDLER
    // ============================================================

    function installTableClickHandler() {

        /*
         * IMPORTANT:
         *
         * Use capture=true.
         *
         * The website's Delete button contains:
         *
         * onclick="deleteSlot(60030)"
         *
         * Capturing the click BEFORE it reaches the button lets us
         * prevent the website's deleteSlot() from running.
         */

        table.addEventListener(
            'click',
            function (event) {

                // ------------------------------------------------
                // Hide / Unhide
                // ------------------------------------------------

                const hideButton =
                    event.target.closest(
                        '.tm-row-hide-toggle'
                    );

                if (
                    hideButton &&
                    table.contains(hideButton)
                ) {
                    event.preventDefault();
                    event.stopPropagation();

                    const tr =
                        hideButton.closest('tr');

                    toggleRowHidden(tr);

                    return;
                }


                // ------------------------------------------------
                // Delete
                // ------------------------------------------------

                const deleteButton =
                    event.target.closest(
                        'button.btn-danger[onclick*="deleteSlot"]'
                    );

                if (
                    deleteButton &&
                    table.contains(deleteButton)
                ) {
                    // Stop the website's inline onclick handler.
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();

                    handleDelete(deleteButton);

                    return;
                }

            },
            true // CAPTURE PHASE
        );
    }


    function toggleRowHidden(tr) {
        if (!tr) return;

        const key = tr.dataset.tmHideKey;

        if (!key) return;

        if (hiddenKeys.has(key)) {
            hiddenKeys.delete(key);
        } else {
            hiddenKeys.add(key);
        }

        saveHiddenKeys();

        decorateAllRows();

        dt.draw(false);

        updateHiddenToolbar();
    }


    // ============================================================
    // BACKGROUND DELETE
    // ============================================================

    async function handleDelete(button) {
        if (button.dataset.tmDeleting === '1') {
            return;
        }

        const slotId =
            getDeleteSlotId(button);

        if (!slotId) {
            await showError(
                'Delete Failed',
                'Could not determine the slot ID for this row.'
            );

            return;
        }

        const tr =
            button.closest('tr');

        const rowDescription =
            getRowDescription(tr, slotId);

        // --------------------------------------------------------
        // Confirmation
        // --------------------------------------------------------

        const confirmed =
            await showDeleteConfirmation();

        if (!confirmed) {
            return;
        }

        button.dataset.tmDeleting = '1';

        const originalText =
            button.textContent;

        button.disabled = true;
        button.textContent = 'Deleting...';

        try {

            const url =
                `/ta/slot/${encodeURIComponent(slotId)}/delete`;

            const response =
                await fetch(url, {
                    method: 'GET',

                    credentials: 'same-origin',

                    headers: {
                        'X-Requested-With':
                            'XMLHttpRequest'
                    },

                    cache: 'no-store'
                });


            // ----------------------------------------------------
            // FAILED
            // ----------------------------------------------------

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status} ${response.statusText}`
                );
            }


            // ----------------------------------------------------
            // SUCCESS
            //
            // Remove from DataTables itself rather than simply
            // removing the <tr>.
            // ----------------------------------------------------

            dt.row(tr).remove().draw(false);

            updateHiddenToolbar();

            console.log(`Slot ${slotId} deleted.`);


            /*
             * IMPORTANT:
             *
             * Nothing here reloads the page.
             *
             * We also never call the website's original
             * deleteSlot() function.
             */

        } catch (error) {

            console.error(
                '[Viva TA Tools] Delete failed:',
                error
            );

            button.disabled = false;
            button.textContent = originalText;
            button.dataset.tmDeleting = '0';

            await showError(
                'Delete Failed',
                `Delete failed for ${rowDescription}.\n\n${error.message}`
            );
        }
    }


    function getDeleteSlotId(button) {
        if (button.dataset.slotId) {
            return button.dataset.slotId;
        }

        const onclick =
            button.getAttribute('onclick') || '';

        // Supports:
        //
        // deleteSlot(60030)
        // deleteSlot('60030')
        // deleteSlot("60030")

        const match =
            onclick.match(
                /deleteSlot\s*\(\s*['"]?(\d+)['"]?\s*\)/
            );

        if (!match) {
            return null;
        }

        button.dataset.slotId = match[1];

        return match[1];
    }


    function getRowDescription(tr, slotId) {
        if (!tr) {
            return `slot ${slotId}`;
        }

        const date =
            normalizeText(
                tr.cells[2]?.textContent
            );

        const time =
            normalizeText(
                tr.cells[3]?.textContent
            );

        if (date && time) {
            return `slot ${slotId} (${date}, ${time})`;
        }

        return `slot ${slotId}`;
    }


    // ============================================================
    // SWEETALERT
    // ============================================================

async function showDeleteConfirmation() {
    // Fallback if SweetAlert isn't available.
    if (typeof window.swal !== 'function') {
        return window.confirm(
            'Are You Sure?\n\n' +
            'This slot will be deleted permanently.'
        );
    }

    const swalPromise = window.swal({
        title: 'Are You Sure?',
        text: 'This slot will be deleted permanently.',
        icon: 'warning',

        buttons: {
            cancel: {
                text: 'Cancel',
                visible: true,
                value: false
            },

            confirm: {
                text: 'Confirm',
                value: true,
                visible: true
            }
        },

        dangerMode: true
    });

    /*
     * SweetAlert doesn't always treat Enter as Confirm.
     * Handle it ourselves.
     */
    const keyHandler = function (event) {
        const overlay =
            document.querySelector(
                '.swal-overlay--show-modal'
            );

        if (!overlay) return;

        if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            const confirmButton =
                overlay.querySelector(
                    '.swal-button--confirm'
                );

            if (confirmButton) {
                confirmButton.click();
            }
        }

        // Optional convenience:
        // Escape = Cancel
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            const cancelButton =
                overlay.querySelector(
                    '.swal-button--cancel'
                );

            if (cancelButton) {
                cancelButton.click();
            }
        }
    };

    document.addEventListener(
        'keydown',
        keyHandler,
        true
    );

    try {
        const result = await swalPromise;
        return result === true;
    } finally {
        document.removeEventListener(
            'keydown',
            keyHandler,
            true
        );
    }
}

    async function showError(title, message) {
        if (typeof window.swal === 'function') {

            await window.swal({
                title: title,
                text: message,
                icon: 'error',
                button: 'OK'
            });

            return;
        }

        window.alert(
            `${title}\n\n${message}`
        );
    }


    // ============================================================
    // LOCAL STORAGE
    // ============================================================

    function loadHiddenKeys() {
        try {
            const saved =
                JSON.parse(
                    localStorage.getItem(STORAGE_KEY) || '[]'
                );

            return new Set(
                Array.isArray(saved) ? saved : []
            );

        } catch (error) {
            console.warn(
                '[Viva TA Tools] Could not load hidden rows:',
                error
            );

            return new Set();
        }
    }


    function saveHiddenKeys() {
        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(
                    [...hiddenKeys]
                )
            );
        } catch (error) {
            console.warn(
                '[Viva TA Tools] Could not save hidden rows:',
                error
            );
        }
    }


    // ============================================================
    // UTILITIES
    // ============================================================

    function normalizeText(value) {
        return String(value || '')
            .replace(/\s+/g, ' ')
            .trim();
    }

})();