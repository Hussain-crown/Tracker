/** @type {import('next').NextConfig} */
const { withSentryConfig } = require('@sentry/nextjs')

const nextConfig = {
  reactStrictMode: true,
}

module.exports = withSentryConfig(nextConfig, {
  silent: !process.env.SENTRY_DSN,
  disableSourceMapUpload: !process.env.SENTRY_AUTH_TOKEN,
  telemetry: false,
})
