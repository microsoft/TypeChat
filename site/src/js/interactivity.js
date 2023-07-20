// @ts-check

{
    /** @type {any} */
    let lastTimeout;

    /** @type {HTMLButtonElement | null} */
    const copyButton = document.querySelector(".typechat-code-copy button");
    copyButton?.addEventListener("click", async (event) => {
        clearTimeout(lastTimeout);
        try {
            await navigator.clipboard?.writeText("npm install typescript");
            copyButton.textContent = "✅";
        }
        catch {
            copyButton.textContent = "❌";
        }
        lastTimeout = setTimeout(() => {
            copyButton.textContent = "📋";
        }, 2000);
    });
}

{
    const selectElements = /** @type {HTMLCollectionOf<HTMLSelectElement>} */ (document.getElementsByClassName("nav-on-change"));
    for (const select of selectElements) {
        const change = () => {
            window.location.pathname = select.value;
        };
        select.onchange = change;
        // if (select.options.length === 1 && window.location.pathname !== select.value) {
        //     change();
        // }
    }
}
