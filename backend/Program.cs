var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/", () => new
{
    application = "Docker Best Practices API",
    status = "Running"
});

app.MapGet("/api/health", () => Results.Ok(new
{
    status = "Healthy"
}));

app.Run();
