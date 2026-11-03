# Video Generation Skill Python SDK

This skill guides the implementation of video generation functionality using the coze-coding-dev-sdk package and CLI tool, enabling creation of high-quality videos from text descriptions and images.

## Overview

Video Generation allows you to build applications that create video content from text prompts and/or images using AI models, enabling creative workflows, animation automation, and video content production.

**IMPORTANT**: coze-coding-dev-sdk MUST be used in backend code only. Never use it in client-side code.

**IMPORTANT**: To use reference video and reference audio input capabilities (multimodal features of Seedance 2.0), you MUST ensure `coze-coding-dev-sdk` version >= 0.5.17.

## Prerequisites

The coze-coding-dev-sdk package is already installed. Import it as shown in the examples below.

## Quick Start

```python
from coze_coding_dev_sdk.video import VideoGenerationClient, TextContent
from coze_coding_utils.runtime_ctx.context import new_context

ctx = new_context(method="video.generate")

client = VideoGenerationClient(ctx=ctx)

video_url, response, last_frame_url = client.video_generation(
    content_items=[
        TextContent(text="A futuristic city with flying vehicles at sunset")
    ],
    model="doubao-seedance-2-0-260128",
    resolution="720p",
    ratio="16:9",
    duration=5,
    watermark=False
)

if video_url:
    print(f"Video URL: {video_url}")
```

**About Context (`ctx`):**

- `Context` is used for request tracking and tracing across distributed systems
- Created using `new_context(method="service.operation")` factory function
- Automatically generates `run_id` and reads `space_id`, `project_id` from environment variables
- It automatically injects headers like `logid`, `run_id`, `space_id` into API calls
- **Optional**: If you don't need request tracking, you can omit `ctx` parameter: `VideoGenerationClient()`
- Recommended for production environments to enable observability and debugging

## Supported Models

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

```python
VideoGenerationClient(
    config: Optional[Config] = None,
    ctx: Optional[Context] = None,
    custom_headers: Optional[Dict[str, str]] = None,
    verbose: bool = False
)
```

**Parameters:**

- `config`: SDK configuration (API key, base URL, timeout)
- `ctx`: Optional context for tracing and monitoring
- `custom_headers`: Custom HTTP headers (e.g., `{"x-run-mode": "test_run"}` **Note: Do NOT include this parameter in production code. It is only for internal testing purposes.**).
- `verbose`: Enable verbose HTTP request logging

### video_generation() Method

```python
client.video_generation(
    content_items: List[Union[TextContent, ImageURLContent, VideoURLContent, AudioURLContent]],
callback_url: Optional[str] = None,
return_last_frame: Optional[bool] = False,
model: str = "doubao-seedance-2-0-260128",
max_wait_time: int = 900,
resolution: Optional[str] = "720p",
ratio: Optional[str] = "16:9",
duration: Optional[int] = 5,
watermark: Optional[bool] = True,
seed: Optional[int] = None,
camerafixed: Optional[bool] = False,
generate_audio: Optional[bool] = True
) -> Tuple[Optional[str], Dict, str]
```

**Input Parameters:**

| Parameter           | Type                                        | Default                          | Description                                                                       |
|---------------------|---------------------------------------------|----------------------------------|-----------------------------------------------------------------------------------|
| `content_items`     | `List[Union[TextContent, ImageURLContent, VideoURLContent, AudioURLContent]]` | Required | Input content for video generation (text, images, reference video/audio). Reference video and audio are only supported by `doubao-seedance-2-0-260128`. |
| `callback_url`      | `str`                                       | `None`                           | Optional callback URL for task status notifications                               |
| `return_last_frame` | `bool`                                      | `False`                          | Return the last frame image of the generated video                                |
| `model`             | `str`                                       | `doubao-seedance-2-0-260128` | Model name to use for generation                                                  |
| `max_wait_time`     | `int`                                       | `900`                            | Maximum wait time in seconds                                                      |
| `resolution`        | `str`                                       | `"720p"`                         | Video resolution (`"480p"`, `"720p"`, or `"1080p"`) |
| `ratio`             | `str`                                       | `"16:9"`                         | Video aspect ratio (`"16:9"`, `"9:16"`, `"1:1"`, `"4:3"`, `"3:4"`, `"21:9"`, `"adaptive"`) |
| `duration`          | `int`                                       | `5`                              | Video duration in seconds (4-12s, or -1 for smart selection)              |
| `watermark`         | `bool`                                      | `True`                           | Add watermark to generated videos                                                 |
| `seed`              | `int`                                       | `None`                           | Random seed for reproducible generation                                           |
| `camerafixed`       | `bool`                                      | `False`                          | Fix camera position during generation                                             |
| `generate_audio`    | `bool`                                      | `True`                           | Controls whether the generated video includes audio synchronized with the visuals |

**Content Types:**

```python
class TextContent:
    type: Literal["text"] = "text"
    text: str


class ImageURLContent:
    type: Literal["image_url"] = "image_url"
    image_url: ImageURL
    role: Optional[Literal["first_frame", "last_frame", "reference_image"]] = None


class ImageURL:
    url: str


# Reference video — only supported by doubao-seedance-2-0-260128
class VideoURLContent:
    type: Literal["video_url"] = "video_url"
    video_url: VideoURL
    role: Optional[Literal["reference_video"]] = "reference_video"


class VideoURL:
    url: str


# Reference audio — only supported by doubao-seedance-2-0-260128
class AudioURLContent:
    type: Literal["audio_url"] = "audio_url"
    audio_url: AudioURL
    role: Optional[Literal["reference_audio"]] = "reference_audio"


class AudioURL:
    url: str
```

**Response:**

Returns a tuple: `(video_url, response_dict, last_frame_url)`

- `video_url`: URL of the generated video (or `None` if failed/cancelled)
- `response_dict`: Complete response data dictionary
- `last_frame_url`: URL of the last frame image (if `return_last_frame=True`)

**Response Dictionary Example:**

```python
{
    "id": "cgt-2025******-****",
    "model": "doubao-seedance-2-0-260128",
    "status": "succeeded",
    "content": {
        "video_url": "https://ark-content-generation-cn-beijing.tos-cn-beijing.volces.com/..."
    },
    "seed": 10,
    "resolution": "720p",
    "ratio": "16:9",
    "duration": 5,
    "framespersecond": 24,
    "usage": {
        "completion_tokens": 108900,
        "total_tokens": 108900
    },
    "created_at": 1743414619,
    "updated_at": 1743414673
}
```

### Mutually Exclusive Scenarios

`content_items` must follow exactly one of three scenarios. The SDK validates these client-side and raises `ValueError` with a clear message before sending the request.

| Scenario | Allowed roles | Models |
|---|---|---|
| **Text-to-Video** | `TextContent` only | both |
| **Image-to-Video (first / first+last)** | `ImageURLContent` with `role="first_frame"` (≤1), optionally `role="last_frame"` (≤1) | both |
| **Multimodal Reference** | `ImageURLContent` with `role="reference_image"` (0–9), `VideoURLContent` (0–3, role auto-set to `reference_video`), `AudioURLContent` (0–3, role auto-set to `reference_audio`) | `doubao-seedance-2-0-260128` only |

**Rules enforced by the SDK:**

- ❌ You cannot mix `first_frame`/`last_frame` with any `reference_image`/`reference_video`/`reference_audio` in the same request.
- ❌ Multimodal Reference requires **at least 1** `reference_image` or `reference_video`. Audio alone is not allowed.
- ❌ Multimodal Reference is **only** supported by `doubao-seedance-2-0-260128`. Passing reference items with other models will raise.
- ❌ Counts: `reference_image ≤ 9`, `reference_video ≤ 3`, `reference_audio ≤ 3`, `first_frame ≤ 1`, `last_frame ≤ 1`. `last_frame` requires a matching `first_frame`.
- ✅ To approximate "first/last frame + multimodal reference," use the Multimodal scenario and ask in the prompt for a specific reference image to act as the first or last frame (e.g. `"首帧使用图片1，尾帧使用图片2"`). For strict first/last-frame guarantees, use the Image-to-Video scenario instead.

### video_generation_async() Method

Async version of `video_generation()` for concurrent video generation tasks.

```python
async def video_generation_async(
        content_items: List[Union[TextContent, ImageURLContent, VideoURLContent, AudioURLContent]],
        callback_url: Optional[str] = None,
        return_last_frame: Optional[bool] = False,
        model: str = "doubao-seedance-2-0-260128",
        max_wait_time: int = 900,
        resolution: Optional[str] = "720p",
        ratio: Optional[str] = "16:9",
        duration: Optional[int] = 5,
        watermark: Optional[bool] = True,
        seed: Optional[int] = None,
        camerafixed: Optional[bool] = False,
        generate_audio: Optional[bool] = True
) -> Tuple[Optional[str], Dict, str]
```

Parameters and return values are identical to `video_generation()`.

## Usage Examples

### Text-to-Video Generation

```python
from coze_coding_dev_sdk.video import VideoGenerationClient, TextContent
from coze_coding_utils.runtime_ctx.context import new_context

ctx = new_context(method="video.generate")

client = VideoGenerationClient(ctx=ctx)

video_url, response, _ = client.video_generation(
    content_items=[
        TextContent(text="A serene mountain landscape with a flowing river")
    ],
    model="doubao-seedance-2-0-260128",
    resolution="720p",
    ratio="16:9",
    duration=5,
    watermark=False
)

generated_video_url = video_url
```

### Image-to-Video (First Frame)

```python
from coze_coding_dev_sdk.video import (
    VideoGenerationClient,
    TextContent,
    ImageURLContent,
    ImageURL
)
from coze_coding_utils.runtime_ctx.context import new_context

ctx = new_context(method="video.generate")

client = VideoGenerationClient(ctx=ctx)

video_url, response, _ = client.video_generation(
    content_items=[
        TextContent(text="Animate this scene with gentle camera movement"),
        ImageURLContent(
            image_url=ImageURL(url="https://www.coze.cn/pages/_next/static/media/coze-2-logo.1f091b47.png"),
            role="first_frame"
        )
    ],
    model="doubao-seedance-2-0-260128",
    resolution="720p",
    ratio="16:9",
    duration=5
)

generated_video_url = video_url
```

### Image-to-Video (First & Last Frame)

```python
from coze_coding_dev_sdk.video import (
    VideoGenerationClient,
    TextContent,
    ImageURLContent,
    ImageURL
)
from coze_coding_utils.runtime_ctx.context import new_context

ctx = new_context(method="video.generate")

client = VideoGenerationClient(ctx=ctx)

video_url, response, _ = client.video_generation(
    content_items=[
        TextContent(text="Smooth transition between frames"),
        ImageURLContent(
            image_url=ImageURL(url="https://www.coze.cn/pages/_next/static/media/coze-2-logo.1f091b47.png"),
            role="first_frame"
        ),
        ImageURLContent(
            image_url=ImageURL(url="https://www.coze.cn/pages/_next/static/media/coze-2-logo.1f091b47.png"),
            role="last_frame"
        )
    ],
    model="doubao-seedance-2-0-260128",
    resolution="720p",
    ratio="16:9",
    duration=5
)

generated_video_url = video_url
```

### Image-to-Video (Reference Images, Seedance 2.0)

Use multiple `reference_image` items with `doubao-seedance-2-0-260128` to guide the visual style/character of the generated video. Reference images cannot be combined with `first_frame`/`last_frame` (see [Mutually Exclusive Scenarios](#mutually-exclusive-scenarios)).

```python
from coze_coding_dev_sdk.video import (
    VideoGenerationClient,
    TextContent,
    ImageURLContent,
    ImageURL
)
from coze_coding_utils.runtime_ctx.context import new_context

ctx = new_context(method="video.generate")

client = VideoGenerationClient(ctx=ctx)

video_url, response, _ = client.video_generation(
    content_items=[
        TextContent(text="基于参考图1的人物形象，生成一段在城市街道行走的视频"),
        ImageURLContent(
            image_url=ImageURL(url="https://example.com/ref1.png"),
            role="reference_image"
        ),
        ImageURLContent(
            image_url=ImageURL(url="https://example.com/ref2.png"),
            role="reference_image"
        ),
    ],
    model="doubao-seedance-2-0-260128",
    resolution="720p",
    ratio="16:9",
    duration=5
)

generated_video_url = video_url
```

### Multimodal Reference (Seedance 2.0 — Image + Video + Audio)

`doubao-seedance-2-0-260128` accepts reference images, a reference video, and a reference audio in a single request. Use it when you want the model to imitate a video's camera/composition while keeping a specific soundtrack and visual identity.

```python
from coze_coding_dev_sdk.video import (
    VideoGenerationClient,
    TextContent,
    ImageURLContent,
    ImageURL,
    VideoURLContent,
    VideoURL,
    AudioURLContent,
    AudioURL,
)

client = VideoGenerationClient()

video_url, response, _ = client.video_generation(
    content_items=[
        TextContent(
            text=(
                "全程使用视频1的第一视角构图，全程使用音频1作为背景音乐。"
                "第一人称视角果茶宣传广告，seedance牌「苹苹安安」苹果果茶限定款；"
                "首帧为图片1，你的手摘下一颗带晨露的阿克苏红苹果……尾帧定格为图片2。"
                "背景声音统一为女生音色。"
            )
        ),
        ImageURLContent(
            image_url=ImageURL(url="https://ark-project.tos-cn-beijing.volces.com/doc_image/r2v_tea_pic1.jpg"),
            role="reference_image",
        ),
        ImageURLContent(
            image_url=ImageURL(url="https://ark-project.tos-cn-beijing.volces.com/doc_image/r2v_tea_pic2.jpg"),
            role="reference_image",
        ),
        VideoURLContent(
            video_url=VideoURL(url="https://ark-project.tos-cn-beijing.volces.com/doc_video/r2v_tea_video1.mp4"),
            role="reference_video",
        ),
        AudioURLContent(
            audio_url=AudioURL(url="https://ark-project.tos-cn-beijing.volces.com/doc_audio/r2v_tea_audio1.mp3"),
            role="reference_audio",
        ),
    ],
    model="doubao-seedance-2-0-260128",
    ratio="16:9",
    duration=11,
    generate_audio=True,
    watermark=False,
)

generated_video_url = video_url
```

**Notes:**

- The text prompt should explicitly reference each input by index (e.g. `图片1`, `图片2`, `视频1`, `音频1`) so the model knows how to use them.
- `reference_video` and `reference_audio` are accepted **only** by `doubao-seedance-2-0-260128`. Other models will reject these content types.
- Multiple `reference_image` entries are allowed and are numbered in the order they appear in `content_items`.

### Custom Headers and Mock Mode

```python
from coze_coding_dev_sdk import Config
from coze_coding_dev_sdk.video import VideoGenerationClient, TextContent

config = Config()

custom_headers = {
    "x-custom-field": "custom-value",
    "x-run-mode": "test_run"
}

client = VideoGenerationClient(config, custom_headers=custom_headers)

video_url, response, _ = client.video_generation(
    content_items=[
        TextContent(text="A modern office workspace")
    ],
    model="doubao-seedance-2-0-260128",
    resolution="720p",
    ratio="16:9",
    duration=5
)

generated_video_url = video_url
```

### Return Last Frame

```python
from coze_coding_dev_sdk.video import VideoGenerationClient, TextContent

client = VideoGenerationClient()

video_url, response, last_frame_url = client.video_generation(
    content_items=[
        TextContent(text="A beautiful sunset over the ocean")
    ],
    model="doubao-seedance-2-0-260128",
    resolution="720p",
    ratio="16:9",
    duration=5,
    return_last_frame=True
)

generated_video_url = video_url
last_frame = last_frame_url
```

### Error Handling

```python
from coze_coding_dev_sdk import APIError
from coze_coding_dev_sdk.video import VideoGenerationClient, TextContent

client = VideoGenerationClient()

try:
    video_url, response, _ = client.video_generation(
        content_items=[
            TextContent(text="A beautiful landscape")
        ],
        model="doubao-seedance-2-0-260128",
        resolution="720p",
        ratio="16:9",
        duration=5
    )

    generated_video_url = video_url

except APIError as error:
    raise error
except Exception as error:
    raise error
```

### Batch Generation (Async)

For generating videos from multiple prompts, use `video_generation_async()` for parallel execution:

```python
import asyncio
from coze_coding_dev_sdk.video import VideoGenerationClient, TextContent

client = VideoGenerationClient()


async def batch_generate():
    prompts = [
        "A sunset over mountains",
        "A futuristic cityscape",
        "A serene beach scene"
    ]

    tasks = [
        client.video_generation_async(
            content_items=[TextContent(text=prompt)],
            model="doubao-seedance-2-0-260128",
            resolution="720p",
            ratio="16:9",
            duration=5
        )
        for prompt in prompts
    ]

    results = await asyncio.gather(*tasks)
    return results


results = asyncio.run(batch_generate())

video_urls = [video_url for video_url, response, _ in results if video_url]
```

**Manual Concurrency Control:**

```python
import asyncio
from coze_coding_dev_sdk.video import VideoGenerationClient, TextContent

client = VideoGenerationClient()


async def generate_with_concurrency_limit(prompts: list[str], max_concurrent: int = 2):
    results = []

    for i in range(0, len(prompts), max_concurrent):
        batch = prompts[i:i + max_concurrent]
        batch_tasks = [
            client.video_generation_async(
                content_items=[TextContent(text=prompt)],
                model="doubao-seedance-2-0-260128",
                resolution="720p",
                ratio="16:9",
                duration=5
            )
            for prompt in batch
        ]
        batch_results = await asyncio.gather(*batch_tasks)
        results.extend(batch_results)

    return results


prompts = [
    "A sunset over mountains",
    "A futuristic cityscape",
    "A serene beach scene",
    "A tropical rainforest",
    "A snowy mountain peak"
]

results = asyncio.run(generate_with_concurrency_limit(prompts, max_concurrent=2))

video_urls = [video_url for video_url, response, _ in results if video_url]
```

### Sequential Video Generation (Video Consistency)

Use the last frame of the previous video as the first frame of the next video to maintain visual consistency across multiple video segments:

```python
from coze_coding_dev_sdk.video import VideoGenerationClient, TextContent, ImageURLContent, ImageURL

client = VideoGenerationClient()

scene_prompts = [
    "A girl walking through a forest path, morning light filtering through trees",
    "The girl discovers a hidden waterfall, camera slowly approaching",
    "The girl sits by the waterfall, peaceful atmosphere, birds flying"
]

video_urls = []
last_frame_url = None

for i, prompt in enumerate(scene_prompts):
    content_items = [TextContent(text=prompt)]

    if last_frame_url:
        content_items.insert(0, ImageURLContent(image_url=ImageURL(url=last_frame_url)))

    video_url, response, last_frame_url = client.video_generation(
        content_items=content_items,
        model="doubao-seedance-2-0-260128",
        resolution="720p",
        ratio="16:9",
        duration=5,
        return_last_frame=True
    )

    if video_url:
        video_urls.append(video_url)

final_videos = video_urls
```

**Key Points:**
- Set `return_last_frame=True` to get the last frame URL of each generated video
- Use `ImageURLContent` to pass the last frame as the first frame of the next video
- This ensures smooth visual transitions between consecutive video segments
- Ideal for creating story-driven or continuous scene videos

### Callback URL

```python
from coze_coding_dev_sdk.video import VideoGenerationClient, TextContent

client = VideoGenerationClient()

video_url, response, _ = client.video_generation(
    content_items=[
        TextContent(text="A beautiful landscape")
    ],
    model="doubao-seedance-2-0-260128",
    resolution="720p",
    ratio="16:9",
    duration=5,
    callback_url="https://your-domain.com/webhook/video-generation"
)

print(f"Task ID: {response['id']}")
print(f"Video URL: {video_url}")
```

## CLI Usage

The SDK includes a command-line tool `coze-coding-ai` for quick video generation without writing code.

### Basic CLI Usage

```bash
coze-coding-ai video --prompt "A futuristic city at sunset" --output result.json
```

### CLI Options

```bash
coze-coding-ai video [OPTIONS]

Options:
  -p, --prompt <text>          Text description of the video
  -i, --image-url <url>        Image URL (single or comma-separated for two images)
  -s, --size <size>            Video resolution (e.g., 1920x1080)
  -d, --duration <seconds>     Video duration (5-10 seconds)
  -m, --model <model>          Model name
  --callback-url <url>         Callback URL for task status notifications
  --return-last-frame          Return the last frame image
  --watermark                  Add watermark to the video
  --seed <number>              Random seed for reproducible generation
  --camerafixed                Fix camera position during generation
  -o, --output <path>          Output file path (JSON)
  -H, --header <header>        Custom HTTP header (format: "Key: Value" or "Key=Value")
  --mock                       Use mock mode (test run without actual generation)
  -v, --verbose                Show detailed HTTP request logs
  --help                       Show this message and exit
```

### CLI Examples

**Basic text-to-video:**

```bash
coze-coding-ai video \
  --prompt "A serene mountain landscape with a lake" \
  --size 1920x1080 \
  --duration 5 \
  --output result.json
```

**Image-to-video (first frame):**

```bash
coze-coding-ai video \
  --prompt "Animate this scene" \
  --image-url "https://www.coze.cn/pages/_next/static/media/coze-2-logo.1f091b47.png" \
  --size 1280x720 \
  --duration 5 \
  --output result.json
```

**Image-to-video (first & last frame):**

```bash
coze-coding-ai video \
  --prompt "Smooth transition" \
  --image-url "https://www.coze.cn/pages/_next/static/media/coze-2-logo.1f091b47.png,https://www.coze.cn/pages/_next/static/media/coze-2-logo.1f091b47.png" \
  --size 1920x1080 \
  --duration 5 \
  --output result.json
```

**With custom model (optional, uses default if not specified):**

```bash
coze-coding-ai video \
  --prompt "A beautiful sunset" \
  --model "doubao-seedance-2-0-260128" \
  --size 1920x1080 \
  --duration 5 \
  --output result.json
```

**With custom headers:**

```bash
coze-coding-ai video \
  --prompt "A beautiful sunset" \
  --header "x-custom-field: custom-value" \
  --header "x-request-id: 12345" \
  --output result.json
```

**Return last frame:**

```bash
coze-coding-ai video \
  --prompt "A beautiful sunset" \
  --return-last-frame \
  --output result.json
```

**Mock mode (testing):**

```bash
coze-coding-ai video \
  --prompt "Test video generation" \
  --mock \
  --output result.json
```

**With callback URL:**

```bash
coze-coding-ai video \
  --prompt "A futuristic city" \
  --callback-url "https://your-domain.com/webhook" \
  --output result.json
```

**Verbose mode:**

```bash
coze-coding-ai video \
  --prompt "A beautiful landscape" \
  --verbose \
  --output result.json
```

## Key Points

- **Local File Path Detection**: If the user provides a local file path (e.g., `/Users/xxx/file.png`, `./file.png`, `~/Downloads/image.jpg`, `C:\Users\xxx\file.png`) or a temporary sandbox proxy URL (e.g., `code.coze.cn/api/sandbox/coze_coding/file/proxy?...`) instead of a persistent HTTP URL, you MUST first upload it using the Storage skill to get a permanent remote URL, then use that URL for this skill. Never pass local paths or ephemeral sandbox URLs directly as URL parameters.
- **Duration Range**: Video duration must be between 4-12 seconds, or -1 for smart selection
- **Resolution Options**: Supports 480p, 720p, and 1080p resolutions
- **Aspect Ratios**: Supports 16:9, 9:16, 1:1, 4:3, 3:4, 21:9, and adaptive aspect ratios
- **Backend Only**: Never expose API keys in client-side code
- **Error Handling**: Always use try-catch blocks and check if `video_url` is not `None` before using results
- **Config Management**: Use `Config` class for proper API authentication
- **Custom Headers**: Use `custom_headers` for mock mode or custom metadata
- **Async Processing**: Use `video_generation_async()` for parallel execution of multiple video generation tasks
- **Concurrency Control**: Implement manual batching to limit concurrent requests and avoid rate limiting (recommended
  max 2-3 concurrent video generations)
- **CLI Tool**: Use `coze-coding-ai video` command for quick generation without writing code
- **Polling Mechanism**: The SDK automatically polls for task completion with a 5-second interval and 300-second timeout
- **Retry Logic**: Automatic retry with exponential backoff for rate limiting and timeout errors
- **Video URL Storage**: The returned video URLs are already stored in object storage with a valid expiration period.
  Unless absolutely necessary, you should use these URLs directly without re-uploading to your own object storage system