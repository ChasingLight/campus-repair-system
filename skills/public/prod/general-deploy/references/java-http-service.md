# Java HTTP Service Template

当仓库明显命中下面这些特征时，使用这份 reference：

- 存在 `pom.xml` 或等价的 Maven 构建信号
- 存在单一 HTTP 入口，例如 `src/main/java/.../Main.java`
- 服务通过 `PORT` 环境变量或等价参数监听端口
- 仓库没有比这更强的现成 deploy 脚本、wrapper 或 Make target
- 项目不是 Android，也不是需要额外容器编排的多模块服务

## Canonical `.coze` Fields

```toml
[project]
entrypoint = "src/main/java/com/example/simplejavahttpservice/Main.java"
requires = ["java-17"]

[deploy]
build = ["bash", "scripts/build.sh"]
run = ["bash", "scripts/run.sh", "-p", "5000"]

[deploy.profile]
kind = "service"
flavor = "web"
```

## Notes

- `project.requires = ["java-17"]` 对应 bundled asset `simple-java-http-service` 的 Maven compiler release。只有当 `pom.xml`、Gradle toolchain 或现有 `.coze` 明确表明是 `25` 时，才改成 `java-25`。
- 这里的 `project.entrypoint` 是 bundled asset 的实际入口路径。真实仓库里如果主类路径不同，应写成仓库里的真实入口文件，不要硬编码示例路径。
- 优先复用仓库里已有的 deploy 脚本、`mvnw`、Make target 或其他 wrapper；只有在完整扫描后确认缺失、且这套简单模板能覆盖真实行为时，才补建下面的脚本。
- 不要把 `.coze` 写成直接 `java ...` 或 `mvn ...` 的裸命令；仍然应让 `.coze` 指向脚本入口。
- 如果你看到类似 `build = ["mvn", "clean", "package", "-DskipTests"]` 或 `run = ["java", "-cp", "target/classes", "..."]` 这样的配置，不要把它当作这个模板的“已完成状态”；这说明脚本入口没有落盘，应继续修正。
- 这类 HTTP 服务端口固定为 `5000`；如果源码默认值不同，也应在 deploy 入口统一收敛到 `5000`，除非用户明确要求保留其他端口。
- 如果脚本位于 `scripts/` 目录，通常应先从 `SCRIPT_DIR` 回到上一层项目根目录再执行构建或启动；不要默认沿用调用时的当前目录。
- 默认不要补写 `deploy.deps`；只有仓库事实明确需要额外系统依赖时才写。如果没有明确依赖，也不要写成 `deps = []`。

## Script Authoring

当仓库命中了这套模板、`deploy.build` / `deploy.run` 的底层行为已经明确，但脚本文件缺失时，可以补齐下面两个脚本：

- `scripts/build.sh`
- `scripts/run.sh`

不要顺手生成 `[dev]` 对应脚本；本 skill 默认不处理 `[dev]`。

### `build.sh`

职责：

- 只负责构建可运行产物
- 优先复用 Maven wrapper；没有 wrapper 时再回退到系统 `mvn`
- 先基于脚本自身位置回到项目根目录再执行；不要依赖调用者当前目录

推荐骨架：

```bash
#!/bin/bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

if [ -x "./mvnw" ]; then
  ./mvnw -DskipTests package dependency:copy-dependencies
else
  mvn -DskipTests package dependency:copy-dependencies
fi
```

如果仓库是多模块 Maven、Shade/Assembly/Jib 等定制打包链路，或真正使用的是 Gradle，就不要套这份骨架。

### `run.sh`

职责：

- 只负责启动 HTTP 服务
- 默认端口固定为 `5000`
- 允许保留一个简单的 `-p` 参数解析，与 `.coze` 的 `["bash", "scripts/run.sh", "-p", "5000"]` 保持一致

推荐骨架：

```bash
#!/bin/bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

PORT=5000
MAIN_CLASS="com.example.simplejavahttpservice.Main"

usage() {
  echo "Usage: $0 -p <port>"
}

while getopts "p:h" opt; do
  case "$opt" in
    p)
      PORT="$OPTARG"
      ;;
    h)
      usage
      exit 0
      ;;
    \?)
      echo "Invalid option: -$OPTARG"
      usage
      exit 1
      ;;
  esac
done

if [ ! -d target/classes ]; then
  echo "Compiled classes not found under target/classes"
  exit 1
fi

CLASSPATH="target/classes"
if [ -d target/dependency ]; then
  CLASSPATH="$CLASSPATH:target/dependency/*"
fi

export PORT
exec java -cp "$CLASSPATH" "$MAIN_CLASS"
```

### Guardrails

- 只有在主类名、产物位置和端口传递方式都清晰时，才补 `scripts/run.sh`；如果主类不是示例里的 `com.example.simplejavahttpservice.Main`，要改成仓库里的真实类名。
- 如果仓库依赖 `spring-boot:run`、Gradle `bootRun`、容器镜像入口或多模块聚合打包，不要硬套这份模板。
- 可以先基于脚本自身位置 `cd` 回项目根目录；不要依赖调用者的 `pwd`、`COZE_WORKSPACE_PATH`，或其他额外的 workdir 包装。
- `.coze` 继续引用脚本，不要为了省事改成 `bash -c`、`java -jar ...` 之类的内联命令。
- 如果根目录 `.coze` 复用了 `subproj/scripts/build.sh` 或 `subproj/scripts/run.sh`，还要确认脚本内部最终会回到 `subproj` 根目录执行。
- 如果真实入口不是单一主类，或 classpath / 产物路径无法稳定推断，就不要照抄这份 reference。
