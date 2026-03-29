import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  return NextResponse.json({ id: params.id });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json();
  return NextResponse.json({ id: params.id, ...body });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  return new NextResponse(null, { status: 204 });
}
