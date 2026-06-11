import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ hotelId: string }> }
) {
  try {
    const { hotelId } = await props.params;
    const body = await req.json();
    const { sessionId, rating, comment } = body;

    if (!sessionId || !rating) {
      return NextResponse.json({ error: "Session ID and rating are required." }, { status: 400 });
    }

    const ratingVal = parseInt(rating);
    if (isNaN(ratingVal) || ratingVal < 1 || ratingVal > 5) {
      return NextResponse.json({ error: "Rating must be between 1 and 5 stars." }, { status: 400 });
    }

    const sb = createAdminClient();

    // 1. Verify hotel plan
    const { data: hotel } = await sb
      .from("hotels")
      .select("plan")
      .eq("id", hotelId)
      .single();

    if (!hotel) {
      return NextResponse.json({ error: "Restaurant not found." }, { status: 404 });
    }

    if (hotel.plan.toLowerCase() === "basic") {
      return NextResponse.json({ error: "Feedback is not enabled on this plan." }, { status: 403 });
    }

    // 2. Verify table session belongs to hotel
    const { data: session } = await sb
      .from("table_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("hotel_id", hotelId)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Invalid table session." }, { status: 404 });
    }

    // 3. Insert feedback
    const { data: feedback, error } = await sb
      .from("feedback")
      .insert({
        hotel_id: hotelId,
        session_id: sessionId,
        rating: ratingVal,
        comment: comment ? String(comment).trim() : null,
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json(feedback);
  } catch (err: any) {
    console.error("Error submitting guest review:", err);
    return NextResponse.json({ error: "Failed to submit review." }, { status: 500 });
  }
}
