// Minimal precursor to the full asset-intake screen (#2): a native file picker
// for the user's own SKELDAL.DDL, read entirely client-side. No OPFS
// persistence yet — the user re-picks the file each session until #2 lands.
export function pickDDLFile(): Promise<File> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ddl';
    input.addEventListener(
      'change',
      () => {
        const file = input.files?.[0];
        if (file) resolve(file);
        else reject(new Error('No file selected'));
      },
      { once: true },
    );
    input.click();
  });
}
