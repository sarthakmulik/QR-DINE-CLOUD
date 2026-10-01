import { redirect } from "next/navigation";
import { getTableSignature } from "@/lib/crypto";

export default async function TakeawayRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ hotelId: string }>;
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const { hotelId } = await params;
  
  // Generate a random virtual table number between 900000 and 999999
  const virtualTableNumber = Math.floor(900000 + Math.random() * 100000);
  
  // Generate the cryptographic signature for this virtual table so the Dine API accepts it
  const signature = getTableSignature(hotelId, virtualTableNumber);
  
  redirect(`/dine/${hotelId}/${virtualTableNumber}?sign=${signature}`);
}
