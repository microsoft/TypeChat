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