#!/usr/bin/env node
import { mkdir, writeFile, stat, rm } from "fs/promises";
import { join, dirname, relative } from "path";
import { exec } from "child_process";
import { program } from "commander";
import chalk from "chalk";

const PACKAGE_NAME_REGEX = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

const exists = (path: string) =>
    stat(path).then(
        () => true,
        () => false
    );

async function makeFolders(path: string) {
    if (!(await exists(dirname(path)))) await makeFolders(dirname(path));
    if (!(await exists(path))) await mkdir(path);
}

async function makeFile(path: string, cwd: string, content: string) {
    console.log(`${chalk.cyan.bold("info")} ${chalk.green("created")} ${relative(cwd, path)}`);
    await makeFolders(dirname(path));
    await writeFile(path, content);
}

function runCommand(command: string, cwd: string) {
    console.log(`${chalk.cyan.bold("info")} ${chalk.green("running")} ${command}`);

    return new Promise((res, rej) => {
        const child = exec(command, { cwd });

        child.on("error", rej);
        child.on("exit", res);
    });
}

program.name("kaboomer").version("0.0.1").description("A CLI to scaffold KaboomJS games.");

program
    .command("init")
    .description("initialize a new project")
    .argument("<dir>", "the root of the project")
    .option("-f, --force", "overwrite existing folder")
    .action(async (root: string, opts: { force?: boolean; auto?: boolean }) => {
        const projectRoot = join(process.cwd(), root);

        if (await exists(projectRoot)) {
            if (!opts.force) {
                console.log("ERROR: project root seems to already exist, run with --force to overwrite.");
                process.exit(1);
            }
            await rm(projectRoot, { recursive: true });
        }

        console.log(`${chalk.cyan.bold("info")} scaffolding inside ${root}\n`);

        await makeFolders(projectRoot);
        await makeFile(
            join(projectRoot, "src", "index.ts"),
            projectRoot,
            `// This is the main file that handles loading scenes and importing kaboom.
// You never modify the loadScenes function, but feel free to load some
// assets using loadSprite, etc.

import kaboom from "kaboom";
kaboom();

// You can add your asset loading calls here
// loadSprite("...", "...")

async function loadScenes() {
    // Get all scene files inside ./scenes
    const scenes = import.meta.glob("./scenes/*.ts");

    // A basic regex to match any .ts file inside ./scenes
    const SCENE_FILE = /\\.\\/scenes\\/([^.]+)\\.ts/;

    for (const scenePath in scenes) {
        // Define the scene.
        const sceneName = scenePath.replace(SCENE_FILE, "$1");

        scene(sceneName, async () => {
            const sceneInit: { default: () => any } = (await scenes[scenePath]()) as any;

            sceneInit.default();
        });
    }

    go("main");
}

loadScenes();
`
        );

        await makeFile(
            join(projectRoot, "src", "components", "greet.ts"),
            projectRoot,
            `export function addGreetText(name: string = "World") {
    return add([
        text(\`Hello, \$\{name\}!\`),
        pos(width() / 2, height() / 2)
    ]);
}`
        );

        await makeFile(
            join(projectRoot, "src", "scenes", "main.ts"),
            projectRoot,
            `import { addGreetText } from "../components/greet";

export default function scene() {
    console.log("SCENE main");
    addGreetText("Kaboomer");

    onClick(() => {
        go("other");
    });
}
`
        );

        await makeFile(
            join(projectRoot, "src", "scenes", "other.ts"),
            projectRoot,
            `import { addGreetText } from "../components/greet";

export default function scene() {
    console.log("SCENE other");
    addGreetText("Other");

    onClick(() => {
        go("main");
    });
};
`
        );

        await makeFile(
            join(projectRoot, "index.html"),
            projectRoot,
            `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kaboomer Project</title>
</head>
<body>
    <script type="module" src="src/index.ts"></script>
</body>
</html>`
        );

        await makeFile(
            join(projectRoot, ".prettierrc"),
            projectRoot,
            JSON.stringify(
                {
                    tabWidth: 4,
                    printWidth: 120,
                },
                null,
                2
            )
        );

        await makeFile(join(projectRoot, ".gitignore"), projectRoot, ["node_modules", "package-lock.json"].join("\n"));

        await makeFile(
            join(projectRoot, "package.json"),
            projectRoot,
            JSON.stringify(
                {
                    name: PACKAGE_NAME_REGEX.test(root) ? root : "unnamed-game",
                    version: "0.0.1",
                    description: "A project scaffolded by Kaboomer.",
                    main: "dist/index.js",
                    scripts: {
                        start: "vite .",
                        format: "prettier -w src/**",
                    },
                    dependencies: { kaboom: "latest" },
                    devDependencies: { vite: "latest", prettier: "latest" },
                    keywords: [],
                    author: "",
                    license: "ISC",
                },
                null,
                2
            )
        );

        await makeFile(
            join(projectRoot, "tsconfig.json"),
            projectRoot,
            JSON.stringify(
                {
                    compilerOptions: {
                        strict: true,
                        lib: ["DOM", "ESNext"],
                        module: "ESNext",
                        typeRoots: ["./node_modules"],
                        types: ["kaboom/dist/global.d.ts", "vite/client"],
                    },
                },
                null,
                2
            )
        );

        const recommendedCommands = [`cd ${root}`, `npm install -D`, `npm run start`];

        console.log(`\n${chalk.green.bold("done")} scaffolded project in ${chalk.cyan(root)}, get started by running:`);

        for (const command of recommendedCommands) {
            const [commandName, ...commandArgs] = command.split(" ");
            console.log(`    ${chalk.green(commandName)} ${commandArgs.join(" ")}`);
        }
    });

program.parse();
