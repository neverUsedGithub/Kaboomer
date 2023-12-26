#!/usr/bin/env node
import { mkdir, writeFile, stat, rm } from "fs/promises";
import { join, dirname, relative } from "path";
import { exec } from "child_process";
import { Option, program } from "commander";
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

        child.stdout?.on("data", (data) => process.stdout.write(`> ${data}`));
        child.stderr?.on("data", (data) => process.stdout.write(`> ${data}`));

        child.on("error", rej);
        child.on("exit", res);
    });
}

program.name("kaboomer").version("0.1.5").description("A CLI to scaffold KaboomJS games.");

const templates = {
    empty: {
        assets: null,
        "src/components": null,
        "src/scenes/main.ts": `export default function scene() {
    add([ text("Hello, World!"), pos(width() / 2, height() / 2) ]);
}`,
    },
    "multi-scene": {
        assets: null,
        "src/components": null,
        "src/scenes/main.ts": `export default function scene() {
    add([ text("Click to go to scene 2."), pos(width() / 2, height() / 2) ]);

    onClick(() => go("other"))
}`,
        "src/scenes/other.ts": `export default function scene() {
    add([ text("Click to go to scene 1."), pos(width() / 2, height() / 2) ]);

    onClick(() => go("main"))
}`,
    },
};

program
    .command("init")
    .description("initialize a new project")
    .argument("<dir>", "the root of the project")
    .option("-f, --force", "overwrite existing folder", false)
    .option("-g, --nogit", "don't use git", false)
    .addOption(
        new Option("-t, --template <template>", "the template to use").choices(Object.keys(templates)).default("empty")
    )
    .action(async (root: string, opts: { force: boolean; template: keyof typeof templates; nogit: boolean }) => {
        const projectRoot = join(process.cwd(), root);

        if (await exists(projectRoot)) {
            if (!opts.force) {
                console.log("ERROR: project root seems to already exist, run with --force to overwrite.");
                process.exit(1);
            }
            await rm(projectRoot, { recursive: true });
        }

        console.log(
            `${chalk.cyan.bold("info")} scaffolding inside ${chalk.cyan(root)} using template ${chalk.yellow(
                opts.template
            )}\n`
        );

        await makeFolders(projectRoot);

        await makeFolders(join(projectRoot, "assets"));

        const usedTemplate = templates[opts.template];
        for (const [path, fileValue] of Object.entries(usedTemplate)) {
            const realPath = join(projectRoot, ...path.split("/"));

            if (fileValue === null) await makeFolders(realPath);
            else if (typeof fileValue === "string") await makeFile(realPath, projectRoot, fileValue);
            else await makeFile(realPath, projectRoot, JSON.stringify(fileValue, null, 4));
        }

        await makeFile(
            join(projectRoot, "src", "index.ts"),
            projectRoot,
            `// This is the main file that handles loading scenes and importing kaboom.
// You never modify the loadScenes function, but feel free to load some
// global assets using loadSprite, etc.

import kaboom from "kaboom";
kaboom();

// You can add your global asset loading calls here, if you only use an asset in a single scene, then load it in there.
// For example:
// import playerSpriteURL from "@assets/player.png";
// loadSprite("player", playerSpriteURL);

async function loadScenes() {
    // Get all scene files inside ./scenes
    const scenes = import.meta.glob("./scenes/*.ts");

    // A basic regex to match any .ts file inside ./scenes
    const SCENE_FILE = /\\.\\/scenes\\/([^.]+)\\.ts/;

    for (const scenePath in scenes) {
        // Define the scene.
        const sceneName = scenePath.replace(SCENE_FILE, "$1");

        scene(sceneName, async (props: any) => {
            const sceneInit: { default: (props: any) => any } = (await scenes[scenePath]()) as any;

            sceneInit.default(props);
        });
    }

    go("main");
}

loadScenes();
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
                4
            )
        );

        if (!opts.nogit) {
            await makeFile(
                join(projectRoot, ".gitignore"),
                projectRoot,
                ["node_modules", "package-lock.json", "dist"].join("\n")
            );
            await runCommand("git init", projectRoot);
        }

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
                        dev: "vite .",
                        start: "vite build && vite preview",
                        format: "prettier -w src/**",
                    },
                    dependencies: { kaboom: "latest" },
                    devDependencies: { vite: "latest", prettier: "latest" },
                    keywords: [],
                    author: "",
                    license: "ISC",
                },
                null,
                4
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
                        target: "ESNext",
                        module: "ESNext",
                        types: ["vite/client", "./node_modules/kaboom/dist/global.d.ts"],
                        moduleResolution: "Bundler",
                        paths: {
                            "@assets/*": ["./assets/*"],
                            "@components/*": ["./src/components/*"],
                        },
                    },
                },
                null,
                4
            )
        );

        await makeFile(
            join(projectRoot, "vite.config.js"),
            projectRoot,
            `import { fileURLToPath, URL } from "url";
import { defineConfig } from "vite";

export default defineConfig({
    resolve: {
        alias: {
            "@assets": fileURLToPath(new URL("./assets", import.meta.url)),
            "@components": fileURLToPath(new URL("./src/components", import.meta.url)),
        },
    },
});
`
        );

        const recommendedCommands = [`cd ${root}`, `npm install -D`, `npm run dev`];

        console.log(`\n${chalk.green.bold("done")} scaffolded project in ${chalk.cyan(root)}, get started by running:`);

        for (const command of recommendedCommands) {
            const [commandName, ...commandArgs] = command.split(" ");
            console.log(`    ${chalk.green(commandName)} ${commandArgs.join(" ")}`);
        }
    });

program.parse();
