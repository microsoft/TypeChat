/**
 * 
 * @param {import("@11ty/eleventy").UserConfig} eleventyConfig 
 */
module.exports = function (eleventyConfig) {
    eleventyConfig.addPassthroughCopy("./src/css/5.3.0_dist_css_bootstrap.min.css");
    return {
        dir: {
            input: "src",
            output: "_site"
        }
    };
}