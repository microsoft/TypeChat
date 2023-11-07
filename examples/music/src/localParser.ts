import chalk from "chalk";
import axios from "axios";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "../../../.env") });

export async function parseOut(request: string, surl: string) {
    try {
        const result = await axios.post(surl, {
            Text: request,
        });
        console.log(result.data);
    } catch (e) {
        if (e instanceof axios.AxiosError) {
            console.log(e.message);
        } else {
            throw e;
        }
    }
}

export function localParser(userPrompt: string) {
    userPrompt = userPrompt.trim();
    const surl = process.env.PARSER_SERVICE_ENDPOINT;
    if (surl) {
       parseOut(userPrompt, surl);
    }
    if (
        userPrompt === "play" ||
        userPrompt === "resume" ||
        userPrompt === "pause" ||
        userPrompt === "next" ||
        userPrompt === "previous"
    ) {
        console.log(chalk.green("Instance parsed locally:"));
        return JSON.stringify({
            "@steps": [
                {
                    "@func": userPrompt === "play" ? "resume" : userPrompt,
                    "@args": [],
                },
            ],
        });
    } else if (userPrompt.startsWith("play")) {
        const matchedPlaySelect = userPrompt.match(
            /play (T|t|track|Track|#|number|Number|no.|No.)?\s?([0-9]+)/
        );
        if (matchedPlaySelect) {
            const trackOffset = +matchedPlaySelect[2];
            console.log(chalk.green("Instance parsed locally:"));
            return JSON.stringify({
                "@steps": [
                    {
                        "@func": "getLastTrackList",
                        "@args": [],
                    },
                    {
                        "@func": "play",
                        "@args": [{ "@ref": 0 }, trackOffset - 1],
                    },
                ],
            });
        }
    } else if (userPrompt.startsWith("shuffle")) {
        const matchedShuffleSet = userPrompt.match(
            /shuffle (on|off|true|false|yes|no)/
        );
        if (matchedShuffleSet) {
            const shuffleArg = matchedShuffleSet[1];
            let shuffleFunc = "";
            if (["on", "true", "yes"].includes(shuffleArg)) {
                shuffleFunc = "shuffleOn";
            } else if (["off", "false", "no"].includes(shuffleArg)) {
                shuffleFunc = "shuffleOff";
            }
            if (shuffleFunc.length > 0) {
                return JSON.stringify({
                    "@steps": [
                        {
                            "@func": shuffleFunc,
                            "@args": [],
                        },
                    ],
                });
            }
        }
    }
    return undefined;
}
