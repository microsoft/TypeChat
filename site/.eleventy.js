
const dateFormatter = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" });
const listFormatter = new Intl.ListFormat("en-US", { style: "long", type: "conjunction" });

/**
 * 
 * @param {import("@11ty/eleventy").UserConfig} eleventyConfig 
 */
module.exports = async function (eleventyConfig) {
    const shiki = await import("shiki");
    const { EleventyHtmlBasePlugin } = await import("@11ty/eleventy");

    eleventyConfig.addPlugin(EleventyHtmlBasePlugin);

    eleventyConfig.addPassthroughCopy("./src/css");
    eleventyConfig.addPassthroughCopy("./src/js");

    eleventyConfig.addFilter("formatDate", value => dateFormatter.format(value));
    eleventyConfig.addFilter("formatList", value => listFormatter.format(value));

    eleventyConfig.setNunjucksEnvironmentOptions({
        throwOnUndefined: true,
    });

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
            theme: "dark-plus"
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
        },
        pathPrefix: "TypeChat",
    };
}
