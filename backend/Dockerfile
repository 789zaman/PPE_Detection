FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/Ppe.Domain/Ppe.Domain.csproj src/Ppe.Domain/
COPY src/Ppe.Application/Ppe.Application.csproj src/Ppe.Application/
COPY src/Ppe.Infrastructure/Ppe.Infrastructure.csproj src/Ppe.Infrastructure/
COPY src/Ppe.Api/Ppe.Api.csproj src/Ppe.Api/
RUN dotnet restore src/Ppe.Api/Ppe.Api.csproj
COPY src/ src/
RUN dotnet publish src/Ppe.Api/Ppe.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 ppe
COPY --from=build /app .
USER 10001
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --retries=8 CMD wget -qO- http://127.0.0.1:8080/health/live || exit 1
ENTRYPOINT ["dotnet", "Ppe.Api.dll"]
