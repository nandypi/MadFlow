// ==UserScript==
// @name         Viva Term Select
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Adds buttons for quick viva term selection
// @match        https://viva-workflow-z5snvc5h3q-el.a.run.app/ta/
// @match        https://viva-workflow-z5snvc5h3q-el.a.run.app/student/
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Change term only here f{term 1/2/3}{year}
    const MAD2 = 'f22026_cs2006p';
    const MAD1 = 'f22026_cs2003p';

    // Get currently selected course from navbar
    function wrongTermSelected() {
        const courseMenu = [...document.querySelectorAll('.dropdown-menu')].find(menu => menu.querySelector('a[href^="/course/"]')); if (!courseMenu) return false;
        const selectedText = courseMenu.closest('.dropdown').querySelector('.dropdown-toggle').textContent.trim(); const selectedItem = [...courseMenu.querySelectorAll('a[href^="/course/"]')].find(a => a.textContent.trim() === selectedText);
        if (!selectedItem) return false; const selectedCourse = selectedItem.href.split('/').pop();
        return selectedCourse !== MAD1 && selectedCourse !== MAD2;
    }

    if (
      window.location.origin === "https://viva-workflow-z5snvc5h3q-el.a.run.app" &&
      window.location.pathname.startsWith("/student/")
    ) {
      window.location.href = "https://viva-workflow-z5snvc5h3q-el.a.run.app/role/teas";
    } else if (
      window.location.origin === "https://viva-workflow-z5snvc5h3q-el.a.run.app" &&
      window.location.pathname.startsWith("/ta/") &&
      wrongTermSelected()
    ) {
      selectOption(MAD2);
    }

    // Show all rows
    var dt = $('#my-table').DataTable();
    dt.page.len(-1).draw();

    function selectOption(course) {
        window.location.href = `https://viva-workflow-z5snvc5h3q-el.a.run.app/course/${course}`
    }

    function createButton(text, bgColor, course) {
        const btn = document.createElement('button');
        btn.innerHTML = text;
        btn.style.cssText = `
            width:80px;
            height:40px;
            border:none;
            border-radius:50%;
            cursor:pointer;
            font-size:20px;
            color:white;
            background:${bgColor};
            box-shadow:0 2px 6px rgba(0,0,0,.3);
        `;
        btn.onclick = () => selectOption(course);
        return btn;
    }

    function addButtons() {
        if (document.getElementById('quickSelectButtons')) return;

        const container = document.createElement('div');
        container.id = 'quickSelectButtons';
        container.style.cssText = `
            position:fixed;
            top:50px;
            right:20px;
            z-index:999999;
            display:flex;
            gap:10px;
        `;

        container.appendChild(createButton('MAD-2', '#dc3545', MAD2));
        container.appendChild(createButton('MAD-1', '#28a745', MAD1));
        
        document.body.appendChild(container);
    }

    window.addEventListener('load', addButtons);
})();