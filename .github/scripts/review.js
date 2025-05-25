const fs = require("fs");
const path = require("path");
const core = require("@actions/core");
const github = require("@actions/github");
const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

(async () => {
    try {
        const token = process.env.GITHUB_AUTH;
        const prNumber = process.env.PR_NUMBER;
        const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");

        const diffPath = path.resolve("./", "diff.json");
        const diffRaw = fs.readFileSync(diffPath, "utf-8");
        const diff = JSON.parse(diffRaw);

        // Step 1: Send diff to LLM for review
        const prompt =
            "As a senior developer, please review the following code diff and provide feedback as if commenting on a GitHub PR. Please provide a line to put the comment on, the path of the file you are reviewing, and the actual body/content of your review comment. Include feedback on code quality, potential issues, and suggestions for improvement. If you have no feedback, please respond with an empty array. The diff is in JSON format below:";
        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt + "\n\n" + diff,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,

                    properties: {
                        path: {
                            type: Type.STRING,
                        },
                        line: {
                            type: Type.NUMBER,
                        },
                        body: {
                            type: Type.STRING,
                        },
                    },
                },
            },
        });
        const result = response.text;
        console.log("LLM response:", result);
        const comments = JSON.parse(result);

        // Step 2: Post each comment to the PR
        const octokit = github.getOctokit(token);
        for (const comment of comments) {
            await octokit.rest.pulls.createReviewComment({
                owner,
                repo,
                pull_number: Number(prNumber),
                body: comment.body,
                commit_id: github.context.payload.pull_request.head.sha,
                path: comment.path,
                line: comment.line,
                side: "RIGHT",
            });
        }

        console.log(`✅ Posted ${comments.length} review comment(s)`);
    } catch (err) {
        core.setFailed(err.message);
    }
})();
