# Tally AI Prompt — Korea Student Bedding Setup Survey

Copy the prompt below into Tally AI. Replace the three price placeholders with prices from a real supplier quote before publishing.

```text
Create an English-first Tally form titled:

Korea Student Bedding Setup Research

Subtitle:
For incoming or recently arrived exchange and visiting students in Korea

This is a 3–4 minute research survey. It is not a booking, preorder, or payment request. We are testing whether a semester-length bedding rental with a clear pickup and return process would be more useful than buying and disposing of bedding locally.

Use a clean, mobile-friendly layout. Do not ask for passport, visa, immigration, payment-card, housing-document, or other sensitive identity information. Do not add a payment block. Do not describe the form as an official university or dormitory service.

## Eligibility and branching

Add these questions first and end the form for any disqualifying answer:

1. Are you 18 or older?
   - Yes
   - No
   If No, end with: “Thanks. This research survey is currently limited to adults.”

2. Are you an incoming or recent exchange/visiting student who will stay in Korea for at least four months?
   - Yes
   - No
   If No, end with: “Thanks. This first survey is limited to exchange and visiting students staying four months or longer.”

3. Which best describes your arrival timing?
   - I will arrive within the next 90 days
   - I arrived within the last 30 days
   - Neither
   If Neither, end with: “Thanks. This survey is limited to students arriving soon or who have just moved in.”

4. How long will you stay in Korea?
   - 4–6 months
   - 7–12 months
   - More than 12 months
   - Less than 4 months
   If Less than 4 months, end with the same four-month eligibility message.

## Arrival and bedding situation

5. Which university or city will you be associated with?
   - Short answer
   - Optional

6. Where will you live?
   - University dormitory
   - Private room or studio
   - Furnished room or apartment
   - Other
   - Not decided yet

7. Will bedding be provided where you live?
   - No
   - Yes
   - I am not sure yet

8. Which bedding items do you expect to need? Select all that apply.
   - Mattress or mattress pad
   - Blanket or duvet
   - Pillow
   - Bedding cover or sheets
   - I do not know yet
   - Other

9. What would you otherwise do?
   - Bring bedding from home
   - Buy it locally
   - Borrow or receive it from someone
   - Choose furnished housing
   - Sleep without buying anything initially
   - I have not decided
   - Other

10. What would be inconvenient, expensive, or wasteful about that option?
    - Long answer
    - Required
    - Add helper text: “Please describe a specific situation. Do not include passport, visa, payment, or housing documents.”

11. Have you already experienced this move-in problem in Korea?
    - Yes, I have already moved in
    - No, I am preparing to arrive

If the answer is “Yes, I have already moved in”, show:

12. What did you actually do about bedding?
    - Long answer
    - Optional

13. Approximately how much did you spend or expect to spend on bedding?
    - I do not know
    - Less than ₩30,000
    - ₩30,000–₩59,999
    - ₩60,000–₩89,999
    - ₩90,000 or more

## Price and behavior signal

Before the next question, display this text:

“Imagine a clean bedding set for one semester, with a clearly stated pickup and return process. The pilot is not confirmed yet, and this question does not charge you.”

14. Which statement is closest to your reaction to these three research prices?
    - I would reserve at [PRICE_OPTION_1] if the pickup, return, hygiene, and refund terms were clear
    - I would reserve at [PRICE_OPTION_2] if the pickup, return, hygiene, and refund terms were clear
    - I would reserve at [PRICE_OPTION_3] if the pickup, return, hygiene, and refund terms were clear
    - I would consider it, but I would first compare buying locally
    - I would not pay for this
    - I cannot tell yet

Use the three price placeholders exactly as written until the operator replaces them with supplier-quoted prices. Do not invent prices.

15. What would make you trust or reject this service?
    - Long answer
    - Required

## Follow-up consent

16. May we contact you about a future paid pilot if supplier capacity, pickup, return, hygiene, and refund terms are confirmed?
    - Yes
    - No

If Yes, show:

17. What contact channel should we use?
    - Email
    - WhatsApp
    - Instagram
    - Other

18. Contact detail
    - Short answer
    - Optional, but required if the respondent selected Yes to follow-up consent
    - Helper text: “Please provide only the contact detail you want us to use. Do not enter passwords or documents.”

Add a separate consent checkbox:

“I agree that the founder/operator may use my survey answers for this research and may contact me only about this potential pilot.”

Privacy note below the checkbox:

“We do not need passport, visa, immigration, payment, or housing documents. The founder/operator is the response-sheet owner. Raw answers are deleted 30 days after the Gate 1 decision. Opted-in contact details are deleted when the pilot decision is made and no later than 90 days after collection. You may request deletion at any time.”

## Attribution

Add hidden fields, if Tally supports them, named:
    - source
    - school
    - cohort

These should be populated through URL parameters. If hidden fields cannot be configured, add this visible final question:

19. How did you find this survey?
    - University or dormitory office
    - International student community
    - Friend or student club
    - Other

## Completion screen

Show:

“Thank you. Your response helps us understand whether this problem is real for incoming and recently arrived exchange/visiting students. This survey is not a booking, no payment was collected, and the pilot may not launch.”

## Form quality rules

- Keep the form English-first and readable on a phone.
- Do not require a contact detail for survey completion.
- Do not collect payment or promise inventory.
- Use branching to exclude ineligible respondents from the demand metrics.
- Keep the “would reserve” choices separate from “would consider” and “would not pay”.
- Make the university/city field optional.
- Make the form response export include timestamp, source, school, cohort, eligibility, bedding status, current alternative, concrete need, price response, follow-up consent, and contact supplied yes/no.
```

## Publish checklist

Before sharing the form:

1. Replace `[PRICE_OPTION_1]`, `[PRICE_OPTION_2]`, and `[PRICE_OPTION_3]` with supplier-quoted prices.
2. Test each ineligible branch and confirm it ends without collecting contact information.
3. Test both follow-up branches: consent `Yes` shows the optional contact field; `No` does not.
4. Add `source`, `school`, and `cohort` URL parameters for each distribution link.
5. Confirm the form says “research”, not “booking”, “preorder”, or “official university service”.
