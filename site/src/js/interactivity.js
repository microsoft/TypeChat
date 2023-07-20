// @ts-check

{
    /** @type {any} */
    let lastTimeout;

    /** @type {HTMLButtonElement | null} */
    const copyButton = document.querySelector(".typechat-code-copy button");
    copyButton?.addEventListener("click", async () => {
        clearTimeout(lastTimeout);
        try {
            await navigator.clipboard?.writeText("npm install typechat");
            copyButton.textContent = "✅";
            copyButton.title = copyButton.ariaLabel = "Command copied."
        }
        catch {
            copyButton.textContent = "❌";
            copyButton.title = copyButton.ariaLabel = "Error copying."
        }
        lastTimeout = setTimeout(() => {
            copyButton.textContent = "📋";
            copyButton.title = copyButton.ariaLabel = "Copy 'npm install' command."
        }, 1500);
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
