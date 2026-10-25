FROM node:24-alpine

WORKDIR /app

# Copy the pre-bundled standalone binaries and chunks
COPY dist ./dist

# Entrypoint invokes the explita CLI dispatcher
ENTRYPOINT ["node", "dist/main-bin.js"]
CMD ["--help"]
