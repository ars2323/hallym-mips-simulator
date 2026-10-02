/* glints.css is bundled as text (tools/build-ui.ts: loader '.css': 'text')
   and put into a <style> by index.ts, so the folder carries its own styles
   and a caller has one file to reference. */
declare module '*.css' {
  const text: string;
  export default text;
}
