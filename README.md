# Docker Best Practices --- Practice 1 and Practice 2

This guide documents the first two Docker best practices demonstrated in
the Angular frontend and .NET backend lab.

-   **Practice 1:** Keep the Docker build context small with
    `.dockerignore`.
-   **Practice 2:** Use multi-stage builds to keep build tools out of
    the final runtime image.

The examples use **Git Bash on Windows** and assume the terminal is
opened at the project root:

``` bash
cd /d/devops/docker-best-practices-final
```

> The measurements below are the results observed during this lab. Image
> sizes and build-context sizes can vary if files, tags, or Docker
> versions change.

------------------------------------------------------------------------

# Practice 1 --- Keep the build context small with `.dockerignore`

## 1. What problem are we solving?

When you run `docker build`, Docker sends a **build context** to the
builder. The build context is the set of files Docker is allowed to
access for instructions such as `COPY` and `ADD`.

If unnecessary files are included, Docker may have to send and process
more data than the application needs. Examples include:

-   `node_modules/`
-   Angular build output such as `dist/`
-   Git history in `.git/`
-   local environment files such as `.env`
-   test output, logs, temporary files, and large test artifacts

A large build context can slow builds and make it easier to accidentally
copy files that should not be in the image.

## 2. How `.dockerignore` helps

The frontend project uses `frontend/.dockerignore` to exclude
unnecessary files from the build context.

The relevant contents are:

``` dockerignore
node_modules
dist
.angular
.git
.env
.env.*
coverage
npm-debug.log*
temp.txt
large-test.bin
```

Each pattern tells Docker to leave matching files out of the build
context. For example:

-   `node_modules` excludes locally installed Node.js dependencies.
-   `dist` excludes locally generated Angular build output.
-   `.git` excludes repository history.
-   `.env` and `.env.*` exclude local environment files.
-   `temp.txt` and `large-test.bin` exclude the temporary files used for
    the demonstration.

**Important:** `.dockerignore` does not delete files from your computer.
It excludes matching files from the context sent to Docker.

## 3. Why the Dockerfile matters

For this demonstration, the temporary test Dockerfile used a broad copy
instruction:

``` dockerfile
COPY . .
```

This means "copy the files available in the build context into the
current directory in the image." Docker can only copy files that are
included in the context, so `.dockerignore` affects what this
instruction can copy.

In the real Angular Dockerfile, the project uses specific `COPY`
instructions for files and folders needed for the build. Keeping
`.dockerignore` is still important because it prevents unnecessary files
from being sent to the builder.

## 4. Before and after results from this lab

The temporary test used `large-test.bin` and `temp.txt` to make the
difference visible.

  -----------------------------------------------------------------------
  Measurement            Before `.dockerignore`     After `.dockerignore`
                                      filtering                 filtering
  ------------------- ------------------------- -------------------------
  Build context                        10.49 MB                 390 bytes

  Temporary large                           Yes                        No
  file included in                              
  context                                       

  Temporary large                           Yes                        No
  file copied by                                
  `COPY . .`                                    

  Reported `COPY`                       10.6 MB                   45.1 kB
  layer                                         
  -----------------------------------------------------------------------

The key result is that the context fell from **10.49 MB to 390 bytes**
in this demonstration. The `COPY` layer also became much smaller.

The final image size does not always fall by the same amount as the
build context: base-image layers may make up most of the image, and
image-size reporting depends on which layers are included in the
measurement.

## 5. Commands to inspect the final `.dockerignore`

From the project root:

``` bash
cat frontend/.dockerignore
```

This prints the ignore rules currently in use.

To build the Angular image and see the context transfer in the build
output:

``` bash
docker build --no-cache --progress=plain \
  -f frontend/Dockerfile \
  -t frontend-best-practices:demo \
  ./frontend
```

Look for a build log line similar to:

``` text
[internal] load build context
transferring context: ...
```

The exact size can vary as the project changes. The goal is to avoid
sending unnecessary files, not to achieve one fixed number.

## 6. Best-practice summary

-   Keep a `.dockerignore` file beside the Dockerfile/build context.
-   Exclude generated output, dependency folders, Git metadata, local
    environment files, logs, and temporary artifacts when they are not
    needed for the build.
-   Do not blindly exclude files the build actually requires.
-   Review the `load build context` size in the Docker build logs.
-   Remember: `.dockerignore` reduces the context; it does not replace
    careful `COPY` instructions or secret-management practices.

------------------------------------------------------------------------

# Practice 2 --- Use multi-stage builds

## 1. What problem are we solving?

The .NET backend needs the .NET SDK to restore packages and publish the
application. The running API does not need the full SDK; it needs the
ASP.NET Core/.NET runtime and the published application files.

If one SDK image is used for both building and running, the final image
retains build tools that are not needed at runtime. This can increase
the image size and leave unnecessary components in the runtime
environment.

## 2. The single-stage Dockerfile

The lab's single-stage demonstration file is:

**File:** `backend/Dockerfile.single-stage`

``` dockerfile
# SINGLE-STAGE DEMO:
# One SDK image is used to publish AND run the application.
FROM mcr.microsoft.com/dotnet/sdk:10.0

WORKDIR /src

COPY Backend.csproj ./
RUN dotnet restore Backend.csproj

COPY Program.cs ./
RUN dotnet publish Backend.csproj \
    --configuration Release \
    --output /app/publish \
    --no-restore \
    && echo "\n========== SINGLE-STAGE: PUBLISHED APPLICATION FILES ==========" \
    && ls -lah /app/publish \
    && echo "\n========== SINGLE-STAGE: SDKs INCLUDED IN THIS IMAGE ==========" \
    && dotnet --list-sdks

WORKDIR /app/publish
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "Backend.dll"]
```

### What happens?

1.  `FROM .../dotnet/sdk:10.0` selects the SDK image.
2.  `dotnet restore` restores the project's NuGet dependencies.
3.  `dotnet publish` builds and prepares the application for deployment.
4.  The diagnostic commands print the published files and installed SDKs
    in the build log.
5.  `ENTRYPOINT` starts `Backend.dll` when a container is launched.

The image uses the SDK base image all the way through to the final
image. The SDK therefore remains installed in the resulting image.

## 3. Build and inspect the single-stage image

Run from the project root:

``` bash
docker build --no-cache --progress=plain \
  -f backend/Dockerfile.single-stage \
  -t backend-single-stage:demo \
  ./backend
```

In the output, look for these headings:

``` text
SINGLE-STAGE: PUBLISHED APPLICATION FILES
SINGLE-STAGE: SDKs INCLUDED IN THIS IMAGE
```

The lab output included files such as:

``` text
Backend.dll
Backend.deps.json
Backend.runtimeconfig.json
```

It also showed an installed SDK:

``` text
10.0.401 [/usr/share/dotnet/sdk]
```

This demonstrates that the application files are published, but the SDK
is also present in the final single-stage image.

## 4. The multi-stage Dockerfile

The lab's multi-stage file is:

**File:** `backend/Dockerfile`

``` dockerfile
# BUILD STAGE:
# The SDK is used to restore packages and publish the application.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY Backend.csproj ./
RUN dotnet restore Backend.csproj

COPY Program.cs ./
RUN dotnet publish Backend.csproj \
    --configuration Release \
    --output /app/publish \
    --no-restore \
    && echo "\n========== BUILD STAGE: PUBLISHED APPLICATION FILES ==========" \
    && ls -lah /app/publish \
    && echo "\n========== BUILD STAGE: SDKs AVAILABLE ==========" \
    && dotnet --list-sdks

# RUNTIME STAGE:
# Start from a separate image that contains the ASP.NET runtime, not the SDK.
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# Copy only the published application files from the build stage.
COPY --from=build /app/publish .

# Print the runtime contents and verify the available SDKs/runtimes.
RUN echo "\n========== RUNTIME STAGE: FILES COPIED INTO /app ==========" \
    && ls -lah /app \
    && echo "\n========== RUNTIME STAGE: SDK LIST (EXPECTED TO BE EMPTY) ==========" \
    && dotnet --list-sdks \
    && echo "\n========== RUNTIME STAGE: RUNTIMES AVAILABLE ==========" \
    && dotnet --list-runtimes

ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

USER $APP_UID
ENTRYPOINT ["dotnet", "Backend.dll"]
```

### The key idea

There are two stages:

-   **Build stage:** Uses the SDK to restore dependencies and publish
    the application.
-   **Runtime stage:** Starts from the ASP.NET runtime image and
    receives only the published application files.

The instruction that transfers the application files is:

``` dockerfile
COPY --from=build /app/publish .
```

Breaking it down:

-   `--from=build` tells Docker to copy from the stage named `build`.
-   `/app/publish` is the source directory in that stage.
-   `.` is the destination directory in the current stage. Since
    `WORKDIR /app` was set, the destination is `/app` in the runtime
    stage.

The stages have separate filesystems. The runtime stage does not
automatically inherit the build stage's files, so the published output
must be copied explicitly.

## 5. Build and inspect the multi-stage image

Run:

``` bash
docker build --no-cache --progress=plain \
  -f backend/Dockerfile \
  -t backend-multi-stage:demo \
  ./backend
```

Look for these headings:

``` text
BUILD STAGE: PUBLISHED APPLICATION FILES
BUILD STAGE: SDKs AVAILABLE
RUNTIME STAGE: FILES COPIED INTO /app
RUNTIME STAGE: SDK LIST (EXPECTED TO BE EMPTY)
RUNTIME STAGE: RUNTIMES AVAILABLE
```

The lab output showed:

-   The build stage had `Backend.dll` and the other published files.
-   The build stage had SDK `10.0.401`.
-   The runtime stage had the same published application files in
    `/app`.
-   The runtime stage had no SDK entries.
-   The runtime stage had `Microsoft.AspNetCore.App` and
    `Microsoft.NETCore.App` runtimes installed.

This is the direct evidence that the application files were copied into
the runtime stage without copying the SDK itself.

## 6. Compare image sizes

The measured output from this lab was:

``` text
[backend-single-stage:demo]: 351100110 bytes
[backend-multi-stage:demo]: 95944452 bytes
```

Use this command to measure the current local images again:

``` bash
docker image inspect backend-single-stage:demo backend-multi-stage:demo \
  --format='{{.RepoTags}}: {{.Size}} bytes'
```

### Results observed in this lab

  Measurement                         Single-stage   Multi-stage
  --------------------------------- -------------- -------------
  Image size in bytes                  351,100,110    95,944,452
  Approximate decimal MB                 351.10 MB      95.94 MB
  SDK in final image                           Yes            No
  ASP.NET/.NET runtime available               Yes           Yes
  Published application available              Yes           Yes

The multi-stage image was approximately **255.16 MB smaller**, a
reduction of about **72.7%** based on these reported image sizes.

Your results can vary with base-image updates, architecture, application
dependencies, and Docker version.

## 7. Verify that the multi-stage application runs

Start the multi-stage image on host port `8083` (the API listens on
container port `8080`):

``` bash
docker run --rm -d \
  --name backend-multistage-test \
  -p 8083:8080 \
  backend-multi-stage:demo
```

Check that it is running:

``` bash
docker ps --filter "name=backend-multistage-test"
```

Test the root endpoint:

``` bash
curl -i http://localhost:8083/
```

Expected response body:

``` json
{
  "application": "Docker Best Practices API",
  "status": "Running"
}
```

Test the health endpoint:

``` bash
curl -i http://localhost:8083/api/health
```

Expected response body:

``` json
{
  "status": "Healthy"
}
```

Both endpoints returned `HTTP/1.1 200 OK` during the lab, proving that
the smaller image still ran the API correctly.

Stop the test container after testing:

``` bash
docker stop backend-multistage-test
```

Because the container was started with `--rm`, Docker removes it after
it stops. The image remains available.

## 8. Best-practice summary

-   Use the SDK image for building and publishing .NET applications.
-   Use an appropriate runtime image for the final stage.
-   Copy only the published application files from the build stage.
-   Keep the final runtime image free of unnecessary build tools.
-   Inspect build logs to understand what files and tools exist in each
    stage.
-   Measure image size rather than assuming an optimization helped.
-   Test the application after optimizing the image.
-   Multi-stage builds reduce unnecessary components, but they do not by
    themselves guarantee a secure image.

------------------------------------------------------------------------

# Quick revision

  -----------------------------------------------------------------------
  Practice          Problem           Solution          Proof from this
                                                        lab
  ----------------- ----------------- ----------------- -----------------
  1\.               Unneeded files    Exclude files     Context reduced
  `.dockerignore`   enter the build   that the build    from 10.49 MB to
                    context           doesn't need      390 bytes in the
                                                        demo

  2\. Multi-stage   SDK tools remain  Build with SDK;   Image reduced
  build             in the final      run with ASP.NET  from 351.10 MB to
                    image             runtime           95.94 MB; SDK
                                                        absent from
                                                        runtime stage
  -----------------------------------------------------------------------

## Teaching takeaway

**Practice 1 reduces what Docker receives for the build. Practice 2
reduces what the final runtime image contains.** They solve different
problems and work well together.
# docker-best-practices
