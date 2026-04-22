// Jest stub for 'server-only'. In the Next.js runtime this module throws
// if imported from a client component. In the test environment we just
// let it be a no-op so server-side modules can be imported freely.
export {}
