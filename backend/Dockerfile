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

# These commands make the stage difference visible in build logs.
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
