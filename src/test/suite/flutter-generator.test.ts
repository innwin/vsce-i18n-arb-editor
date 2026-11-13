import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findFlutterProject, FlutterGenerator } from '../../i18n-arb-editor/flutter-generator';

suite('Flutter localization generation', () => {
    let root: string;
    let l10n: string;

    setup(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-arb-flutter-'));
        l10n = path.join(root, 'lib', 'l10n');
        fs.mkdirSync(path.join(root, 'lib'));
        fs.mkdirSync(l10n);
    });

    teardown(() => {
        function remove(directory: string) {
            for (const entry of fs.readdirSync(directory)) {
                const file = path.join(directory, entry);
                if (fs.lstatSync(file).isDirectory()) {
                    remove(file);
                } else {
                    fs.unlinkSync(file);
                }
            }
            fs.rmdirSync(directory);
        }
        remove(root);
    });

    function pubspec(contents: string, directory = root) {
        fs.writeFileSync(path.join(directory, 'pubspec.yaml'), contents);
    }

    test('finds Flutter SDK dependencies in the nearest package', () => {
        pubspec('dependencies:\n  flutter:\n    sdk: flutter\n');
        assert.strictEqual(findFlutterProject(l10n), root);
        pubspec('dev_dependencies: {flutter_test: {sdk: flutter}}\n');
        assert.strictEqual(findFlutterProject(l10n), root);
        pubspec('dependencies:\n  other: ^1.0.0\n', path.join(root, 'lib'));
        assert.strictEqual(findFlutterProject(l10n), undefined);
    });

    test('ignores absent or non-Flutter packages and reports malformed pubspecs', () => {
        assert.strictEqual(findFlutterProject(l10n), undefined);
        pubspec('dependencies:\n  flutter: ^1.0.0\n');
        assert.strictEqual(findFlutterProject(l10n), undefined);
        pubspec('dependencies: [invalid\n');
        assert.throws(() => findFlutterProject(l10n));
    });

    test('skips disabled generation and non-Flutter packages', async () => {
        let calls = 0;
        const generator = new FlutterGenerator(async () => { calls++; });
        pubspec('dependencies: [invalid\n');
        await generator.generate(l10n, false);
        pubspec('name: dart_package\n');
        await generator.generate(l10n, true);
        assert.strictEqual(calls, 0);
    });

    test('serializes saves for the same project and continues after failures', async () => {
        pubspec('dependencies: {flutter: {sdk: flutter}}\n');
        const starts: string[] = [];
        let rejectFirst: (error: Error) => void = () => {};
        const generator = new FlutterGenerator(projectRoot => {
            starts.push(projectRoot);
            return starts.length === 1
                ? new Promise<void>((resolve, reject) => { rejectFirst = reject; })
                : Promise.resolve();
        });
        const first = generator.generate(l10n, true);
        const firstResult = first.then(() => undefined, error => error);
        const second = generator.generate(l10n, true);
        assert.deepStrictEqual(starts, [root]);
        rejectFirst(new Error('generation failed'));
        assert.strictEqual((await firstResult).message, 'generation failed');
        await second;
        assert.deepStrictEqual(starts, [root, root]);
    });

    test('runs flutter gen-l10n in the package root', async function () {
        if (process.platform === 'win32') {
            this.skip();
        }
        pubspec('dependencies: {flutter: {sdk: flutter}}\n');
        const bin = path.join(root, 'bin');
        fs.mkdirSync(bin);
        const flutter = path.join(bin, 'flutter');
        fs.writeFileSync(flutter, '#!/bin/sh\nprintf "%s\\n" "$@" > flutter-args.txt\npwd > flutter-cwd.txt\n', { mode: 0o755 });
        const originalPath = process.env.PATH;
        process.env.PATH = `${bin}${path.delimiter}${originalPath || ''}`;
        try {
            await new FlutterGenerator().generate(l10n, true);
            assert.strictEqual(fs.readFileSync(path.join(root, 'flutter-args.txt'), 'utf8'), 'gen-l10n\n');
            assert.strictEqual(fs.realpathSync(fs.readFileSync(path.join(root, 'flutter-cwd.txt'), 'utf8').trim()), fs.realpathSync(root));
            fs.writeFileSync(flutter, '#!/bin/sh\necho "generation failed" >&2\nexit 1\n', { mode: 0o755 });
            await assert.rejects(new FlutterGenerator().generate(l10n, true), /generation failed/);
        } finally {
            if (originalPath === undefined) {
                delete process.env.PATH;
            } else {
                process.env.PATH = originalPath;
            }
        }
    });
});
