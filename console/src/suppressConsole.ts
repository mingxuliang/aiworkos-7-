// Suppress library debug noise — must run before any other module.
(function () {
  const originalLog = console.log;
  const originalInfo = console.info;
  const originalDebug = console.debug;

  const isLibraryNoise = (msg: string) =>
    msg.includes("qwenpaw") ||
    msg.includes("locize") ||
    msg.includes("i18next");

  console.log = function (...args: unknown[]) {
    const msg = args[0]?.toString() || "";
    if (isLibraryNoise(msg)) return;
    originalLog.apply(console, args as []);
  };

  console.info = function (...args: unknown[]) {
    const msg = args[0]?.toString() || "";
    if (isLibraryNoise(msg)) return;
    originalInfo.apply(console, args as []);
  };

  console.debug = function (...args: unknown[]) {
    const msg = args[0]?.toString() || "";
    if (isLibraryNoise(msg)) return;
    originalDebug.apply(console, args as []);
  };
})();
