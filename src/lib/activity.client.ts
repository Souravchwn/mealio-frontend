/**
 * activity.client.ts — Client-only. Counts work the person is waiting for (a save, a delete,
 * a page change) so <ActivityBar /> can show that something is happening, whatever button
 * started it. Background reads are not counted: pages show skeletons for those.
 */

let pending = 0;
const listeners = new Set<() => void>();

function emit() {
    listeners.forEach((fn) => fn());
}

/** Marks one piece of work as started. Call the returned function once when it ends. */
export function startActivity(): () => void {
    pending++;
    emit();
    let ended = false;
    return () => {
        if (ended) return;
        ended = true;
        pending = Math.max(0, pending - 1);
        emit();
    };
}

export function isActive(): boolean {
    return pending > 0;
}

export function onActivityChange(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
