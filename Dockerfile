# Vist runs the agent's browser (Playwright) and the video renderer (Remotion) in one Node server,
# so it starts from Microsoft's Playwright image, which ships Chromium and its system libraries.
FROM mcr.microsoft.com/playwright:v1.64.1-noble

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Remotion renders with its own headless Chrome; fetch it at build time rather than on the first render.
RUN npx remotion browser ensure
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
