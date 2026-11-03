---
name: video-generation
description: Generate high-quality videos from text, images, reference videos, and reference audio using coze-coding-dev-sdk. Use when creating videos (480p/720p/1080p), implementing text-to-video / image-to-video (first / first+last frame) / multimodal reference video (Seedance 2.0), or building any application requiring AI-powered video content creation. Supports multiple aspect ratios, duration control, and reference inputs (image/video/audio).
license: MIT
---

# Video Generation Skill

This skill guides the implementation of video generation functionality using the coze-coding-dev-sdk package and CLI tool, enabling creation of high-quality videos from text descriptions and images.

## Overview

Video Generation allows you to build applications that create video content from text prompts and/or images using AI models, enabling creative workflows, animation automation, and video content production.

## Version Requirements

**IMPORTANT**: To use reference video and reference audio input capabilities (multimodal features of Seedance 2.0), you MUST ensure:

- **Python SDK**: `coze-coding-dev-sdk` version >= 0.5.17
- **TypeScript SDK**: `coze-coding-dev-sdk` version >= 0.7.24

## Supported Languages

This skill supports both Python and TypeScript SDKs. Choose the appropriate version for your project. **You MUST refer to the detailed guide in the corresponding SDK folder.**

- **Python SDK**: See [python/README.md](python/README.md) for installation, client initialization, and usage examples.
- **TypeScript SDK**: See [typescript/README.md](typescript/README.md) for installation, client initialization, and usage examples.