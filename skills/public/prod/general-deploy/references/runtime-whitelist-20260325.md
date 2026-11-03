# Runtime Whitelist (2026-03-25)

选择 `project.requires` 时，只能从下表的 `key` 中挑选。不要编造表外值。

## Rules

- `.coze` 的 `project.requires` 写 `key`。
- 如果仓库语言和主版本能明确识别，优先选择与之匹配的 key。
- 如果现有 `.coze` 已经使用了下表中的 key，并且仓库事实没有冲突，优先保留。
- 如果仓库版本无法可靠识别，只能在同语言的白名单 key 中保守选择，并在结果里说明依据。
- 对用户说明时，只说“支持哪些语言和版本”，不要展开 image、tag 等实现细节。

## Matrix

| language | version | key |
| --- | --- | --- |
| node | `24` | `nodejs-24` |
| node | `22` | `nodejs-22` |
| python | `3.13` | `python-3.13` |
| python | `3.12` | `python-3.12` |
| python | `3.11` | `python-3.11` |
| python | `3.10` | `python-3.10` |
| go | `1.26` | `golang-1.26` |
| go | `1.25` | `golang-1.25` |
| java | `25` | `java-25` |
| java | `17` | `java-17` |

## Selection Hints

- Node
  - 优先从 `package.json`、`.nvmrc`、`packageManager`、CI 配置或现有 `.coze` 识别版本
- Python
  - 优先从 `pyproject.toml` 的 `requires-python`、`.python-version`、现有 lockfile 或现有 `.coze` 识别版本
- Go
  - 优先从 `go.mod` 的 `go` 版本识别
- Java
  - 优先从 `pom.xml`、`build.gradle`、Gradle toolchain、Maven compiler 配置识别

如果只知道语言、不知道主版本，不要装作“精确匹配”。应说明这是基于有限信号做的白名单内选择。
