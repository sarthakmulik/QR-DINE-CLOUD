import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin();
    const params = await props.params;

    const { data, error } = await createAdminClient()
      .from("hotel_payments")
      .select("*")
      .eq("hotel_id", params.id)
      .order("payment_date", { ascending: false });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin();
    const params = await props.params;
    const body = await req.json();
    const { amount, method, notes, payment_date } = body;

    const sb = createAdminClient();

    // 1. Insert the payment record
    const { data: payment, error: insertError } = await sb
      .from("hotel_payments")
      .insert([{
        hotel_id: params.id,
        amount,
        method,
        notes,
        payment_date: payment_date || new Date().toISOString()
      }])
      .select()
      .single();

    if (insertError) throw insertError;

    // 2. Automatically extend next_due_date by 30 days
    const { data: hotel, error: hotelError } = await sb
      .from("hotels")
      .select("next_due_date")
      .eq("id", params.id)
      .single();

    if (hotelError) throw hotelError;

    let currentDueDate = hotel.next_due_date ? new Date(hotel.next_due_date) : new Date();
    // If the due date is in the past, calculate from today to give a full 30 days
    if (currentDueDate < new Date()) {
      currentDueDate = new Date();
    }
    
    currentDueDate.setDate(currentDueDate.getDate() + 30);

    const { error: updateError } = await sb
      .from("hotels")
      .update({
        next_due_date: currentDueDate.toISOString(),
        last_payment_date: new Date().toISOString(),
      })
      .eq("id", params.id);

    if (updateError) throw updateError;

    return NextResponse.json(payment);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
