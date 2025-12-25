import fs from 'fs-extra';
/**
 * Adds an entry to an ignore file (like .gitignore) if it doesn't already exist.
 * Optionally adds a header if the file doesn't have it yet.
 *
 * @param filePath Path to the ignore file
 * @param entry The entry to add (e.g. '.cursor/rules/foo')
 * @param header Optional header line to add before the entry (e.g. '# Cursor Rules')
 * @returns true if the entry was added, false if it already existed
 */
export async function addIgnoreEntry(filePath, entry, header) {
    let content = '';
    if (await fs.pathExists(filePath)) {
        content = await fs.readFile(filePath, 'utf-8');
    }
    const lines = content.split(/\r?\n/).map(line => line.trim());
    // Check if entry already exists (exact match on trimmed line)
    if (lines.includes(entry)) {
        return false;
    }
    let contentToAdd = '';
    // Ensure we start on a new line if file is not empty and doesn't end with newline
    if (content.length > 0 && !content.endsWith('\n')) {
        contentToAdd += '\n';
    }
    // Add header if provided and not present
    if (header && !lines.includes(header)) {
        contentToAdd += `${header}\n`;
    }
    contentToAdd += `${entry}\n`;
    await fs.appendFile(filePath, contentToAdd);
    return true;
}
/**
 * Removes an entry from an ignore file.
 *
 * @param filePath Path to the ignore file
 * @param entry The entry to remove
 * @returns true if the entry was removed, false if it wasn't found
 */
export async function removeIgnoreEntry(filePath, entry) {
    if (!await fs.pathExists(filePath)) {
        return false;
    }
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    // We filter out lines that match the entry (trimmed)
    const newLines = lines.filter(line => line.trim() !== entry);
    if (newLines.length === lines.length) {
        return false;
    }
    // Join back with newlines.
    // If the original file ended with a newline (which split gives empty string at end),
    // join('\n') will preserve it if we kept the empty string.
    // However, split(/\r?\n/) behavior: "foo\n" -> ["foo", ""]
    // filter won't remove "" unless entry is "" (which it shouldn't be).
    let newContent = newLines.join('\n');
    await fs.writeFile(filePath, newContent);
    return true;
}
