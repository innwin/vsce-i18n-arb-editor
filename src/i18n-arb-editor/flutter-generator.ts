import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { load } from 'js-yaml';

function isRecord(value: unknown): value is { [key: string]: unknown } {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function findFlutterProject(directory: string): string | undefined {
    let current = path.resolve(directory);
    while (true) {
        const pubspecPath = path.join(current, 'pubspec.yaml');
        let contents: string;
        try {
            contents = fs.readFileSync(pubspecPath, 'utf8');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
            const parent = path.dirname(current);
            if (parent === current) {
                return undefined;
            }
            current = parent;
            continue;
        }

        const pubspec: unknown = load(contents);
        if (!isRecord(pubspec)) {
            throw new Error(`Invalid pubspec: ${pubspecPath}`);
        }
        for (const section of ['dependencies', 'dev_dependencies']) {
            const dependencies = pubspec[section];
            if (isRecord(dependencies) && Object.keys(dependencies).some(name => {
                const dependency = dependencies[name];
                return isRecord(dependency) && dependency.sdk === 'flutter';
            })) {
                return current;
            }
        }
        return undefined;
    }
}

function runFlutterGenL10n(projectRoot: string): Promise<void> {
    return new Promise((resolve, reject) => {
        exec('flutter gen-l10n', { cwd: projectRoot }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`${error.message}${stderr ? `\n${stderr}` : ''}${stdout ? `\n${stdout}` : ''}`));
                return;
            }
            resolve();
        });
    });
}

export class FlutterGenerator {
    private pending = new Map<string, Promise<void>>();

    constructor(private runCommand: (projectRoot: string) => Promise<void> = runFlutterGenL10n) {}

    async generate(directory: string, enabled: boolean): Promise<void> {
        if (!enabled) {
            return;
        }
        const projectRoot = findFlutterProject(directory);
        if (!projectRoot) {
            return;
        }

        const previous = this.pending.get(projectRoot);
        const run = () => this.runCommand(projectRoot);
        const current = previous ? previous.then(run, run) : run();
        this.pending.set(projectRoot, current);
        const cleanup = () => {
            if (this.pending.get(projectRoot) === current) {
                this.pending.delete(projectRoot);
            }
        };
        current.then(cleanup, cleanup);
        await current;
    }
}

export const flutterGenerator = new FlutterGenerator();
