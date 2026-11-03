# Video Generation Skill TypeScript SDK

This skill guides the implementation of video generation functionality using the coze-coding-dev-sdk package and CLI tool, enabling creation of high-quality videos from text descriptions and images.

## Overview

Video Generation allows you to build applications that create video content from text prompts and/or images using AI models, enabling creative workflows, animation automation, and video content production.

**IMPORTANT**: coze-coding-dev-sdk MUST be used in backend code only. Never use it in client-side code.

**Video URL Storage**: The returned video URLs are already stored in object storage with a valid expiration period. Unless absolutely necessary, you should use these URLs directly without re-uploading to your own object storage system

**IMPORTANT**: To use reference video and reference audio input capabilities (multimodal features of Seedance 2.0), you MUST ensure `coze-coding-dev-sdk` version >= 0.7.24.

## Prerequisites

The coze-coding-dev-sdk package is already installed. Import it as shown in the examples below.

## Extracting Forward Headers (Required)

**IMPORTANT**: Regardless of which backend framework you use (Next.js, Express, Koa, etc.), you **MUST** extract headers from the incoming request and forward them to the SDK using `HeaderUtils.extractForwardHeaders`. This is required for proper request tracing, authentication, and context propagation.

**IMPORTANT**: This feature requires `coze-coding-dev-sdk` version >=0.7.10. **MUST** check the sdk version before use it.

```typescript
import { HeaderUtils } from 'coze-coding-dev-sdk';

// Extract headers from your request object
const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

// Pass customHeaders to your VideoGenerationClient
const client = new VideoGenerationClient({
  customHeaders,
});
```

**Example with Next.js:**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { VideoGenerationClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

export async function POST(request: NextRequest) {
  const { prompt } = await request.json();
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

  const config = new Config();
  const client = new VideoGenerationClient(config, { customHeaders });

  const content = [{ type: 'text' as const, text: prompt }];
  const response = await client.videoGeneration(content, {
    model: 'doubao-seedance-2-0-260128',
    duration: 5,
  });

  return NextResponse.json({ videoUrl: response.videoUrl });
}
```

**Example with Express:**

```typescript
import express, { Request, Response } from 'express';
import { VideoGenerationClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

const app = express();
app.use(express.json());

app.post('/api/video', async (req: Request, res: Response) => {
  const { prompt } = req.body;
  const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>);

  const config = new Config();
  const client = new VideoGenerationClient(config, { customHeaders });

  const content = [{ type: 'text' as const, text: prompt }];
  const response = await client.videoGeneration(content, {
    model: 'doubao-seedance-2-0-260128',
    duration: 5,
  });

  res.json({ videoUrl: response.videoUrl });
});
```

## Quick Start

```typescript
import { VideoGenerationClient, Config } from 'coze-coding-dev-sdk';
import axios from 'axios';
import fs from 'fs';

const config = new Config();
const client = new VideoGenerationClient(config);

const content = [
  {
    type: 'text' as const,
    text: 'A serene mountain landscape with flowing clouds',
  },
];

const response = await client.videoGeneration(content, {
  model: 'doubao-seedance-2-0-260128',
  duration: 5,
  ratio: '16:9',
  resolution: '720p',
});

if (response.videoUrl) {
  const videoData = await axios.get(response.videoUrl, { responseType: 'arraybuffer' });
  fs.writeFileSync('output.mp4', videoData.data);
  console.log('Video saved to output.mp4');
}
```

**About Config:**

- `Config` manages SDK configuration including API key, base URL, and timeout settings
- API credentials are automatically loaded from environment variables
- **Optional**: You can pass custom configuration: `new Config({ apiKey: 'your-key', timeout: 60000 })`
- Recommended for production environments to enable proper authentication and error handling

## Available Models

The SDK supports the following video generation models:

### doubao-seedance-2-0-260128 (Default)

Next-generation professional multimodal video creation model.

**Supported input types:**

- **Text-to-Video**: Generate video from text prompt
- **Image-to-Video**: Generate video with first frame, last frame, or reference images
- **Video-to-Video**: Use reference videos to guide camera composition and motion
- **Audio-to-Video**: Use reference audio as background music/soundtrack

**Key features:**
- Supports image, video, and audio as reference inputs
- Video editing and extension capabilities
- High-precision detail restoration with stable character features
- Optimized for commercial advertising, film production, and social media marketing

## API Reference

### Client Initialization

```typescript
new VideoGenerationClient(
  config?: Config,
  customHeaders?: Record<string, string>
)
```

**Parameters:**

- `config`: SDK configuration (API key, base URL, timeout)
- `customHeaders`: Custom HTTP headers (e.g., `{ "x-run-mode": "test_run" }`)

### videoGeneration() Method

```typescript
client.videoGeneration(
  contentItems: Content[],
  options?: {
    callbackUrl?: string;
    returnLastFrame?: boolean;
    model?: string;
    maxWaitTime?: number;
    resolution?: Resolution;
    ratio?: Ratio;
    duration?: number;
    watermark?: boolean;
    seed?: number;
    camerafixed?: boolean;
    generateAudio?: boolean;
  }
): Promise<VideoGenerationResponse>
```

**Content Interface:**

```typescript
type Content = TextContent | ImageURLContent | VideoURLContent | AudioURLContent;

interface TextContent {
  type: 'text';
  text: string;
}

interface ImageURLContent {
  type: 'image_url';
  image_url: {
    url: string;
  };
  role?: 'first_frame' | 'last_frame' | 'reference_image';
}

// Reference video — only supported by doubao-seedance-2-0-260128
interface VideoURLContent {
  type: 'video_url';
  video_url: {
    url: string;
  };
  role?: 'reference_video';
}

// Reference audio — only supported by doubao-seedance-2-0-260128
interface AudioURLContent {
  type: 'audio_url';
  audio_url: {
    url: string;
  };
  role?: 'reference_audio';
}
```

**Input Parameters:**

| Parameter               | Type                                                                  | Default                            | Description                                                               |
| ----------------------- | --------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| `contentItems`          | `Content[]`                                                           | Required                           | Array of text and/or image content items                                  |
| `options.model`         | `string`                                                              | `'doubao-seedance-2-0-260128'` | Model name (see Available Models section)                                 |
| `options.maxWaitTime`   | `number`                                                              | `900`                              | Maximum wait time in seconds                                              |
| `options.resolution`    | `'480p' \| '720p' \| '1080p'`                                         | `'720p'`                           | Video resolution                  |
| `options.ratio`         | `'16:9' \| '9:16' \| '1:1' \| '4:3' \| '3:4' \| '21:9' \| 'adaptive'` | `'16:9'`                           | Aspect ratio ('adaptive' for smart selection in text-to-video)            |
| `options.duration`      | `number`                                                              | `5`                                | Video duration in seconds (4-12s, or -1 for smart selection)              |
| `options.watermark`     | `boolean`                                                             | `true`                             | Add watermark to generated video                                          |
| `options.seed`          | `number`                                                              | `undefined`                        | Random seed for reproducible results                                      |
| `options.camerafixed`   | `boolean`                                                             | `false`                            | Fix camera position                                                       |
| `options.generateAudio` | `boolean`                                                             | `true`                             | Generate synchronized audio. Set to false for silent video                |
| `options.callbackUrl`   | `string`                                                              | `undefined`                        | Callback URL for async notification                                       |
| `options.returnLastFrame` | `boolean`                                                           | `false`                            | Return the last frame of the video                                        |

**Response Interface:**

```typescript
interface VideoGenerationResponse {
  videoUrl: string | null;
  response: VideoGenerationTask;
  lastFrameUrl: string;
}

interface VideoGenerationTask {
  id: string;
  model?: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  content?: {
    video_url?: string;
    last_frame_url?: string;
  };
  seed?: number;
  resolution?: '480p' | '720p' | '1080p';
  ratio?: '16:9' | '9:16' | '1:1';
  duration?: number;
  framespersecond?: number;
  usage?: {
    completion_tokens?: number;
    total_tokens?: number;
  };
  created_at?: number;
  updated_at?: number;
  error_message?: string;
}
```

**Response Properties:**

```typescript
response.videoUrl; // The generated video URL (null if failed)
response.lastFrameUrl; // The last frame image URL (if requested)
response.response; // Full task response with metadata
response.response.status; // Task status: 'succeeded', 'failed', etc.
response.response.id; // Task ID for tracking
```

### Mutually Exclusive Scenarios

`contentItems` must follow exactly one of three scenarios. The SDK validates these client-side and throws `APIError` (status 400) with a clear message before sending the request.

| Scenario | Allowed roles | Models |
|---|---|---|
| **Text-to-Video** | `TextContent` only | both |
| **Image-to-Video (first / first+last)** | `ImageURLContent` with `role: 'first_frame'` (≤1), optionally `role: 'last_frame'` (≤1) | both |
| **Multimodal Reference** | `ImageURLContent` with `role: 'reference_image'` (0–9), `VideoURLContent` (0–3, role auto-set to `reference_video`), `AudioURLContent` (0–3, role auto-set to `reference_audio`) | `doubao-seedance-2-0-260128` only |

**Rules enforced by the SDK:**

- ❌ You cannot mix `first_frame`/`last_frame` with any `reference_image`/`reference_video`/`reference_audio` in the same request.
- ❌ Multimodal Reference requires **at least 1** `reference_image` or `reference_video`. Audio alone is not allowed.
- ❌ Multimodal Reference is **only** supported by `doubao-seedance-2-0-260128`. Passing reference items with other models will throw.
- ❌ Counts: `reference_image ≤ 9`, `reference_video ≤ 3`, `reference_audio ≤ 3`, `first_frame ≤ 1`, `last_frame ≤ 1`. `last_frame` requires a matching `first_frame`.
- ✅ To approximate "first/last frame + multimodal reference," use the Multimodal scenario and ask in the prompt for a specific reference image to act as the first or last frame (e.g. `"首帧使用图片1，尾帧使用图片2"`). For strict first/last-frame guarantees, use the Image-to-Video scenario instead.

## Usage Examples

### Text-to-Video Generation

```typescript
import { VideoGenerationClient, Config } from 'coze-coding-dev-sdk';

const config = new Config();
const client = new VideoGenerationClient(config);

const content = [
  {
    type: 'text' as const,
    text: 'A futuristic city with flying vehicles at sunset, cinematic camera movement',
  },
];

const response = await client.videoGeneration(content, {
  model: 'doubao-seedance-2-0-260128',
  duration: 5,
  ratio: '16:9',
  resolution: '720p',
});

const videoUrl = response.videoUrl;
```

### Image-to-Video (First Frame)

```typescript
import { VideoGenerationClient, Config } from 'coze-coding-dev-sdk';

const config = new Config();
const client = new VideoGenerationClient(config);

const content = [
  {
    type: 'image_url' as const,
    image_url: {
      url: 'https://www.coze.cn/pages/_next/static/media/coze-2-logo.1f091b47.png',
    },
    role: 'first_frame' as const,
  },
  {
    type: 'text' as const,
    text: 'Camera slowly zooms in, gentle wind blowing',
  },
];

const response = await client.videoGeneration(content, {
  model: 'doubao-seedance-2-0-260128',
  duration: 5,
  ratio: '16:9',
});

const videoUrl = response.videoUrl;
```

### Image-to-Video (First & Last Frame)

```typescript
import { VideoGenerationClient, Config } from 'coze-coding-dev-sdk';

const config = new Config();
const client = new VideoGenerationClient(config);

const content = [
  {
    type: 'image_url' as const,
    image_url: {
      url: 'https://www.coze.cn/pages/_next/static/media/coze-2-logo.1f091b47.png',
    },
    role: 'first_frame' as const,
  },
  {
    type: 'image_url' as const,
    image_url: {
      url: 'https://www.coze.cn/pages/_next/static/media/coze-2-logo.1f091b47.png',
    },
    role: 'last_frame' as const,
  },
  {
    type: 'text' as const,
    text: 'Smooth transition between scenes',
  },
];

const response = await client.videoGeneration(content, {
  model: 'doubao-seedance-2-0-260128',
  duration: 5,
  ratio: '16:9',
});

const videoUrl = response.videoUrl;
```

### Image-to-Video (Reference Images, Seedance 2.0)

Use multiple `reference_image` items with `doubao-seedance-2-0-260128` to guide the visual style/character of the generated video. Reference images cannot be combined with `first_frame`/`last_frame` (see [Mutually Exclusive Scenarios](#mutually-exclusive-scenarios)).

```typescript
import { VideoGenerationClient, Config, Content } from 'coze-coding-dev-sdk';

const config = new Config();
const client = new VideoGenerationClient(config);

const content: Content[] = [
  {
    type: 'text',
    text: '基于参考图1的人物形象，生成一段在城市街道行走的视频',
  },
  {
    type: 'image_url',
    image_url: { url: 'https://example.com/ref1.png' },
    role: 'reference_image',
  },
  {
    type: 'image_url',
    image_url: { url: 'https://example.com/ref2.png' },
    role: 'reference_image',
  },
];

const response = await client.videoGeneration(content, {
  model: 'doubao-seedance-2-0-260128',
  duration: 5,
  ratio: '16:9',
});

const videoUrl = response.videoUrl;
```

### Multimodal Reference (Seedance 2.0 — Image + Video + Audio)

`doubao-seedance-2-0-260128` accepts reference images, a reference video, and a reference audio in a single request. Use it when you want the model to imitate a video's camera/composition while keeping a specific soundtrack and visual identity.

```typescript
import { VideoGenerationClient, Config, Content } from 'coze-coding-dev-sdk';

const config = new Config();
const client = new VideoGenerationClient(config);

const content: Content[] = [
  {
    type: 'text',
    text:
      '全程使用视频1的第一视角构图，全程使用音频1作为背景音乐。' +
      '第一人称视角果茶宣传广告，seedance牌「苹苹安安」苹果果茶限定款；' +
      '首帧为图片1，你的手摘下一颗带晨露的阿克苏红苹果……尾帧定格为图片2。' +
      '背景声音统一为女生音色。',
  },
  {
    type: 'image_url',
    image_url: { url: 'https://ark-project.tos-cn-beijing.volces.com/doc_image/r2v_tea_pic1.jpg' },
    role: 'reference_image',
  },
  {
    type: 'image_url',
    image_url: { url: 'https://ark-project.tos-cn-beijing.volces.com/doc_image/r2v_tea_pic2.jpg' },
    role: 'reference_image',
  },
  {
    type: 'video_url',
    video_url: { url: 'https://ark-project.tos-cn-beijing.volces.com/doc_video/r2v_tea_video1.mp4' },
    role: 'reference_video',
  },
  {
    type: 'audio_url',
    audio_url: { url: 'https://ark-project.tos-cn-beijing.volces.com/doc_audio/r2v_tea_audio1.mp3' },
    role: 'reference_audio',
  },
];

const response = await client.videoGeneration(content, {
  model: 'doubao-seedance-2-0-260128',
  ratio: '16:9',
  duration: 11,
  generateAudio: true,
  watermark: false,
});

const videoUrl = response.videoUrl;
```

**Notes:**

- The text prompt should explicitly reference each input by index (e.g. `图片1`, `图片2`, `视频1`, `音频1`) so the model knows how to use them.
- `reference_video` and `reference_audio` are accepted **only** by `doubao-seedance-2-0-260128`. Other models will reject these content types.
- Multiple `reference_image` entries are allowed and are numbered in the order they appear in the `content` array.

### Video with Audio

```typescript
import { VideoGenerationClient, Config } from 'coze-coding-dev-sdk';

const config = new Config();
const client = new VideoGenerationClient(config);

const content = [
  {
    type: 'text' as const,
    text: 'A man calls out to a woman and says: "Remember, you must never point at the moon with your finger."',
  },
];

const response = await client.videoGeneration(content, {
  model: 'doubao-seedance-2-0-260128',
  duration: 8,
  ratio: '16:9',
  resolution: '720p',
  generateAudio: true,
});

const videoUrl = response.videoUrl;
```

### Custom Headers for Testing

```typescript
import { VideoGenerationClient, Config } from 'coze-coding-dev-sdk';

const config = new Config();

const customHeaders = {
  'x-custom-field': 'custom-value',
};

const client = new VideoGenerationClient(config, customHeaders);

const content = [
  {
    type: 'text' as const,
    text: 'A serene beach scene with gentle waves',
  },
];

const response = await client.videoGeneration(content, {
  model: 'doubao-seedance-2-0-260128',
  duration: 5,
  ratio: '16:9',
});

const videoUrl = response.videoUrl;
```

### Extract Headers from NextRequest (Next.js)

**IMPORTANT**: When building Next.js API routes, you **MUST** extract headers from `NextRequest` and forward them to the SDK using `extractForwardHeaders`. This is required for proper request tracing, authentication, and context propagation.

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { VideoGenerationClient, Config, extractForwardHeaders } from 'coze-coding-dev-sdk';

export async function POST(request: NextRequest) {
  const { prompt, duration, ratio } = await request.json();
  const customHeaders = extractForwardHeaders(request.headers);

  const config = new Config();
  const client = new VideoGenerationClient(config, customHeaders);

  const content = [{ type: 'text' as const, text: prompt }];

  const response = await client.videoGeneration(content, {
    model: 'doubao-seedance-2-0-260128',
    duration: duration || 5,
    ratio: ratio || '16:9',
    resolution: '720p',
  });

  if (response.videoUrl) {
    return NextResponse.json({ videoUrl: response.videoUrl });
  } else {
    return NextResponse.json(
      { error: response.response.error_message || 'Video generation failed' },
      { status: 500 }
    );
  }
}
```

### Error Handling

```typescript
import { VideoGenerationClient, Config, APIError } from 'coze-coding-dev-sdk';

const config = new Config();
const client = new VideoGenerationClient(config);

try {
  const content = [
    {
      type: 'text' as const,
      text: 'A beautiful landscape video',
    },
  ];

  const response = await client.videoGeneration(content, {
    model: 'doubao-seedance-2-0-260128',
    duration: 5,
    ratio: '16:9',
  });

  const videoUrl = response.videoUrl;
} catch (error) {
  if (error instanceof APIError) {
    throw error;
  } else {
    throw error;
  }
}
```

### Batch Generation (Sequential)

For generating multiple videos, you can call `videoGeneration()` sequentially or use `Promise.all()` for parallel execution:

```typescript
import { VideoGenerationClient, Config } from 'coze-coding-dev-sdk';

const config = new Config();
const client = new VideoGenerationClient(config);

const prompts = ['A sunset over mountains', 'A futuristic cityscape', 'A serene beach scene'];

const videoUrls: string[] = [];
for (const promptText of prompts) {
  const content = [{ type: 'text' as const, text: promptText }];

  const response = await client.videoGeneration(content, {
    model: 'doubao-seedance-2-0-260128',
    duration: 5,
    ratio: '16:9',
  });

  if (response.videoUrl) {
    videoUrls.push(response.videoUrl);
  }
}
```

**Parallel Generation with Concurrency Control:**

```typescript
import { VideoGenerationClient, Config } from 'coze-coding-dev-sdk';

const config = new Config();
const client = new VideoGenerationClient(config);

async function generateWithConcurrencyLimit(prompts: string[], maxConcurrent: number = 2) {
  const results = [];

  for (let i = 0; i < prompts.length; i += maxConcurrent) {
    const batch = prompts.slice(i, i + maxConcurrent);

    const batchPromises = batch.map(promptText => {
      const content = [{ type: 'text' as const, text: promptText }];
      return client.videoGeneration(content, {
        model: 'doubao-seedance-2-0-260128',
        duration: 5,
        ratio: '16:9',
      });
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
}

const prompts = [
  'A sunset over mountains',
  'A futuristic cityscape',
  'A serene beach scene',
  'A tropical rainforest',
  'A snowy mountain peak',
];

const responses = await generateWithConcurrencyLimit(prompts, 2);

const videoUrls = responses.filter(r => r.videoUrl).map(r => r.videoUrl);
```

### Sequential Video Generation (Video Consistency)

Use the last frame of the previous video as the first frame of the next video to maintain visual consistency across multiple video segments:

```typescript
import { VideoGenerationClient, Config, Content } from 'coze-coding-dev-sdk';

const config = new Config();
const client = new VideoGenerationClient(config);

const scenePrompts = [
  'A girl walking through a forest path, morning light filtering through trees',
  'The girl discovers a hidden waterfall, camera slowly approaching',
  'The girl sits by the waterfall, peaceful atmosphere, birds flying',
];

const videoUrls: string[] = [];
let lastFrameUrl: string | null = null;

for (const prompt of scenePrompts) {
  const contentItems: Content[] = [{ type: 'text', text: prompt }];

  if (lastFrameUrl) {
    contentItems.unshift({ type: 'image_url', image_url: { url: lastFrameUrl } });
  }

  const response = await client.videoGeneration(contentItems, {
    model: 'doubao-seedance-2-0-260128',
    resolution: '720p',
    ratio: '16:9',
    duration: 5,
    returnLastFrame: true,
  });

  if (response.videoUrl) {
    videoUrls.push(response.videoUrl);
    lastFrameUrl = response.lastFrameUrl || null;
  }
}

const finalVideos = videoUrls;
```

**Key Points:**
- Set `returnLastFrame: true` to get the last frame URL of each generated video
- Use `image_url` content type to pass the last frame as the first frame of the next video
- This ensures smooth visual transitions between consecutive video segments
- Ideal for creating story-driven or continuous scene videos

## CLI Usage

The SDK includes a command-line tool `coze-coding-ai` for quick video generation without writing code.

### Basic CLI Usage

```bash
coze-coding-ai video --model doubao-seedance-2-0-260128 --prompt "A futuristic city at sunset" --output result.json
```

### CLI Options

```bash
coze-coding-ai video [OPTIONS]

Options:
  -m, --model <model>           Model name (default: doubao-seedance-2-0-260128)
  -p, --prompt <text>           Text description of the video
  -i, --image-url <url>         Image URL (single or comma-separated for first/last frame)
  -s, --size <size>             Video resolution (e.g., 1280x720)
  -d, --duration <seconds>      Video duration in seconds (default: 5, or -1 for smart selection)
  -o, --output <path>           Output file path (JSON format)
  --callback-url <url>          Callback URL for async notification
  --return-last-frame           Return last frame image
  --watermark                   Add watermark to video
  --seed <number>               Random seed for reproducible results
  --camerafixed                 Fix camera position
  --generate-audio              Generate synchronized audio (default: true)
  --no-audio                    Generate silent video
  -H, --header <header>         Custom HTTP header (format: "Key: Value" or "Key=Value")
  --mock                        Use mock mode (test run)
  --verbose                     Enable verbose logging
  --help                        Show this message and exit
```

### CLI Examples

**Text-to-Video:**

```bash
coze-coding-ai video \
  --model doubao-seedance-2-0-260128 \
  --prompt "A serene mountain landscape with flowing clouds" \
  --output mountain.json \
  --duration 5 \
  --size 1280x720
```

**Image-to-Video (First Frame):**

```bash
coze-coding-ai video \
  --model doubao-seedance-2-0-260128 \
  --image-url "https://www.coze.cn/pages/_next/static/media/coze-2-logo.1f091b47.png" \
  --prompt "Camera slowly zooms in" \
  --output animation.json \
  --duration 5
```

**Image-to-Video (First & Last Frame):**

```bash
coze-coding-ai video \
  --model doubao-seedance-2-0-260128 \
  --image-url "https://www.coze.cn/pages/_next/static/media/coze-2-logo.1f091b47.png,https://www.coze.cn/pages/_next/static/media/coze-2-logo.1f091b47.png" \
  --prompt "Smooth transition" \
  --output transition.json
```

**With Audio Generation:**

```bash
coze-coding-ai video \
  --model doubao-seedance-2-0-260128 \
  --prompt "A man says: 'Hello, welcome to the future!'" \
  --output audio_video.json \
  --generate-audio
```
**Mock mode (testing):**

```bash
coze-coding-ai video \
  --model doubao-seedance-2-0-260128 \
  --prompt "Test video generation" \
  --output test.json \
  --mock
```
**With reproducible seed:**

```bash
coze-coding-ai video \
  --model doubao-seedance-2-0-260128 \
  --prompt "A magical forest" \
  --output forest.json \
  --seed 42
```

**With verbose logging:**

```bash
coze-coding-ai video \
  --model doubao-seedance-2-0-260128 \
  --prompt "A beautiful landscape" \
  --output landscape.json \
  --verbose
```

## Model Selection Guide

### doubao-seedance-2-0-260128 (Default)

- **Next-generation professional multimodal video creation model**
- Supports image, video, and audio as reference inputs for video generation
- Features video editing and extension capabilities
- High-precision detail restoration with stable character features
- Optimized for commercial advertising, film production, and social media marketing scenarios

## Key Points

- **Local File Path Detection**: If the user provides a local file path (e.g., `/Users/xxx/file.png`, `./file.png`, `~/Downloads/image.jpg`, `C:\Users\xxx\file.png`) or a temporary sandbox proxy URL (e.g., `code.coze.cn/api/sandbox/coze_coding/file/proxy?...`) instead of a persistent HTTP URL, you MUST first upload it using the Storage skill to get a permanent remote URL, then use that URL for this skill. Never pass local paths or ephemeral sandbox URLs directly as URL parameters.
- **Backend Only**: Never expose API keys in client-side code
- **Model Selection**: Default model is `doubao-seedance-2-0-260128`, supporting text/image/video/audio inputs and multimodal reference generation.
- **Content Array**: Use `Content[]` array to pass text prompts, image URLs, reference video/audio URLs with specific roles
- **Image Roles**: `first_frame` and `last_frame` for frame control; `reference_image` for multimodal reference
- **Video/Audio References**: `reference_video` and `reference_audio` content types are only supported by `doubao-seedance-2-0-260128`
- **Duration Options**:
  - Supports 4-12 seconds, or -1 for smart selection
  - Smart selection lets the model choose the optimal duration
- **Aspect Ratios**: Support for 16:9, 9:16, 1:1, 4:3, 3:4, 21:9, and 'adaptive' (smart selection for text-to-video)
- **Resolution Options**: 480p, 720p, and 1080p
- **Audio Generation**:
  - Enabled by default (`generate_audio: true`)
  - Generates synchronized voice, sound effects, and background music
  - Set `generate_audio: false` for silent videos
  - Place dialogue in quotes for better audio generation (e.g., 'He says: "Hello"')
- **Error Handling**: Always use try-catch blocks and check `response.videoUrl` for success
- **Config Management**: Use `Config` class for proper API authentication
- **Custom Headers**: Use `customHeaders` for mock mode or custom metadata
- **Async Processing**: The `videoGeneration()` method waits for completion (polling-based)
- **Task Tracking**: Access task details via `response.response.id` and `response.response.status`
- **Concurrency Control**: Implement manual batching with `Promise.all()` to limit concurrent requests (video generation is resource-intensive)
- **CLI Tool**: Use `coze-coding-ai video` command for quick generation without writing code
- **Response Structure**: Response contains `videoUrl`, `lastFrameUrl`, and full `response` object with task metadata
- **Reproducibility**: Use the `seed` parameter in config for reproducible results
- **Camera Control**: Use `camerafixed` option to fix camera position during generation
- **Watermark**: Watermark is enabled by default, set `watermark: false` to disable
- **Verbose Logging**: Enable `verbose` mode in constructor for detailed HTTP request logging