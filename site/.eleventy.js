const shiki = require("shiki");

/**
 * 
 * @param {import("@11ty/eleventy").UserConfig} eleventyConfig 
 */
module.exports = function (eleventyConfig) {
    eleventyConfig.addPassthroughCopy("./src/css");

    eleventyConfig.amendLibrary("md", () => { });
    eleventyConfig.on("eleventy.before", async () => {
        const highlighter = await shiki.getHighlighter({
            langs: [
                "typescript", "javascript", "tsx", "jsx",
                "jsonc", "json",
                "html", "diff",
                "bat", "sh",
                "python", "py",
            ],
            theme: "github-dark-dimmed"
        });
        eleventyConfig.amendLibrary("md", (mdLib) =>
            mdLib.set({
                highlight: (code, lang) => highlighter.codeToHtml(code, { lang }),
            })
        );
    });

    return {
        dir: {
            input: "src",
            output: "_site"
        }
    };
}
