export async function GET() {
  return Response.json(
    {
      status: "ok",
      service: "mission-control",
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
