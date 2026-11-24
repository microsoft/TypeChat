// @ts-check

{
    const copyContainers = document.querySelectorAll(".typechat-code-copy");

    for (const container of copyContainers) {
        const copyButton = container.querySelector("button");
        const command = container.querySelector("code")?.textContent?.trim();

        if (!copyButton || !command) {
            continue;
        }

        /** @type {ReturnType<typeof setTimeout> | undefined} */
        let lastTimeout;

        copyButton.addEventListener("click", async () => {
            clearTimeout(lastTimeout);

            try {
                await navigator.clipboard.writeText(command);

                copyButton.textContent = "\u2705";
                copyButton.title = copyButton.ariaLabel = "Command copied.";
            } catch {
                copyButton.textContent = "\u274C";
                copyButton.title = copyButton.ariaLabel = "Error copying.";
            }

            lastTimeout = setTimeout(() => {
                copyButton.textContent = "\u{1F4CB}";
                copyButton.title = copyButton.ariaLabel =
                    `Copy ${command} command.`;
            }, 1500);
        });
    }
}

{
    const selectElements = /** @type {HTMLCollectionOf<HTMLSelectElement>} */ (
        document.getElementsByClassName("nav-on-change")
    );

    for (const select of selectElements) {
        const change = () => {
            window.location.pathname = select.value;
        };

        select.onchange = change;
    }
}