import type BinaryFileManagerPlugin from 'main';
import { type App, normalizePath } from 'obsidian';

const REGISTERED_BINARY_FILE_STORAGE_FILE_NAME =
	'.binary-file-manager_binary-file-list.txt';

export class FileListAdapter {
	private app: App;
	private storageFilePath: string;
	private registeredBinaryFilePaths: Set<string>;

	constructor(app: App, plugin: BinaryFileManagerPlugin) {
		this.app = app;
		this.storageFilePath = normalizePath(
			`${app.vault.configDir}/plugins/${plugin.manifest.id}/${REGISTERED_BINARY_FILE_STORAGE_FILE_NAME}`
		);
		this.registeredBinaryFilePaths = new Set<string>();
	}

	async load(): Promise<FileListAdapter> {
		await this.loadBinaryFiles();
		// onLayoutReady may run immediately, so it must not precede registry loading.
		this.app.workspace.onLayoutReady(async () => {
			await this.deleteNonExistingBinaryFiles();
		});
		return this;
	}

	async save() {
		await this.saveBinaryFiles();
	}

	add(filepath: string): void {
		this.registeredBinaryFilePaths.add(filepath);
	}

	delete(filepath: string): void {
		this.registeredBinaryFilePaths.delete(filepath);
	}

	rename(oldPath: string, newPath: string): boolean {
		if (oldPath === newPath) {
			return false;
		}

		// A folder rename also changes every registered path below that folder.
		const affectedPaths = Array.from(this.registeredBinaryFilePaths).filter(
			(path) => path === oldPath || path.startsWith(`${oldPath}/`)
		);
		for (const path of affectedPaths) {
			this.registeredBinaryFilePaths.delete(path);
		}
		for (const path of affectedPaths) {
			this.registeredBinaryFilePaths.add(newPath + path.slice(oldPath.length));
		}
		return affectedPaths.length > 0;
	}

	has(filepath: string): boolean {
		return this.registeredBinaryFilePaths.has(filepath);
	}

	deleteAll(): void {
		this.registeredBinaryFilePaths = new Set<string>();
	}

	private async loadBinaryFiles() {
		if (!(await this.app.vault.adapter.exists(this.storageFilePath))) {
			this.registeredBinaryFilePaths = new Set<string>();
			return;
		}

		const binaryFiles = (
			await this.app.vault.adapter.read(this.storageFilePath)
		)
			.trim()
			.split(/\r?\n/);
		this.registeredBinaryFilePaths = new Set<string>(binaryFiles);
	}

	private async saveBinaryFiles() {
		await this.app.vault.adapter.write(
			this.storageFilePath,
			Array.from(this.registeredBinaryFilePaths).join('\n')
		);
	}

	private async deleteNonExistingBinaryFiles() {
		const difference = new Set(this.registeredBinaryFilePaths);
		for (const file of this.app.vault.getFiles()) {
			difference.delete(file.path);
		}
		for (const fileToBeUnregistered of difference) {
			this.registeredBinaryFilePaths.delete(fileToBeUnregistered);
		}
		await this.saveBinaryFiles();
	}
}
