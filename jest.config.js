/** @type {import("jest").Config} */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    rootDir: ".",
    roots: ["<rootDir>/src"],
    testRegex: ".*\\.spec\\.ts$",
    moduleFileExtensions: ["ts", "js", "json"],
    collectCoverageFrom: ["src/**/*.ts", "!src/**/*.module.ts", "!src/main.ts", "!src/vercel.ts"],
    // The repo had @nestjs/testing in devDependencies but no runner at all, so nothing
    // could ever be executed. Keep this config minimal so the barrier to writing the
    // first real test is as low as possible.
    clearMocks: true
};
