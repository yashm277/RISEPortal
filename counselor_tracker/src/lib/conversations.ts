import { fetchAllRecords, getField } from "./airtable";
import type { Conversation } from "./types";

const COUNSELOR_DB_BASE = "appU2cJpIWIHQI4up";
const CONVERSATIONS_TABLE = "tblzo7zC9Z5EyEZ4z";

export async function getConversationsForCounselor(
  counselorRecordId: string
): Promise<Conversation[]> {
  const records = await fetchAllRecords(
    COUNSELOR_DB_BASE,
    CONVERSATIONS_TABLE,
    {
      fields: [
        "Name",
        "Date",
        "Notes",
        "Select",
        "Counselor Database",
        "Company Name (from Counselor Database)",
      ],
    }
  );

  // Filter to conversations linked to this counselor
  const conversations: Conversation[] = [];

  for (const record of records) {
    const linkedCounselors = getField<string[]>(record, "Counselor Database") || [];
    if (!linkedCounselors.includes(counselorRecordId)) continue;

    const companyNames = getField<string[]>(
      record,
      "Company Name (from Counselor Database)"
    ) || [];

    conversations.push({
      id: record.id,
      date: getField<string>(record, "Date") || "",
      notes: getField<string>(record, "Notes") || "",
      attendee: getField<string>(record, "Select") || "",
      companyName: companyNames[0] || "",
    });
  }

  // Sort chronologically (newest first)
  conversations.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return conversations;
}
