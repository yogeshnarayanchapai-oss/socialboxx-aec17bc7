-- Backfill template-based followup settings (replaces AI-generated followups)
UPDATE public.connected_pages
SET ai_followup_settings = jsonb_build_object(
  'enabled', true,
  'steps', jsonb_build_array(
    jsonb_build_object(
      'delay_hours', 6,
      'message_hint', 'आज मात्र अर्डर गर्ने ग्राहकहरूलाई हामी Free Delivery दिइरहेका छौं। हजुरले आजै अर्डर गर्न चाहनुहुन्छ भने कृपया जानकारी दिनुहोस्। अफर आजकै लागि मात्र लागू हुनेछ।',
      'media', null
    ),
    jsonb_build_object(
      'delay_hours', 24,
      'message_hint', 'यदि तपाईंले आज नै अर्डर गर्नुभयो भने Free Delivery सँगै रु. १०० छुट पनि पाउनुहुनेछ। यो विशेष अफर आजको दिनका लागि मात्र मान्य भएकाले अवसर नगुमाउनुहोस्।' || E'\n\n' || 'अर्डर कन्फर्म गर्न कृपया आफ्नो मोबाइल नम्बर पठाउनुहोस्।',
      'media', null
    ),
    jsonb_build_object(
      'delay_hours', 36,
      'message_hint', 'यदि तपाईंलाई Product को असरबारे कुनै शंका छ भने ढुक्क हुनुहोस्, यसमा १४ दिनको Money Back Guarantee उपलब्ध छ। उत्पादनले अपेक्षित परिणाम नदिएमा १४ दिनभित्र सम्पर्क गर्नुभयो भने पूरा रकम फिर्ता गरिनेछ।' || E'\n\n' || 'अर्डर कन्फर्म गर्न कृपया आफ्नो मोबाइल नम्बर पठाउनुहोस्।',
      'media', null
    ),
    jsonb_build_object(
      'delay_hours', 72,
      'message_hint', 'अहिले उक्त Product को स्टक सीमित मात्रामा बाँकी छ। साथै हाल विशेष Limited Offer पनि उपलब्ध छ।' || E'\n\n' || 'यस अफरको पूरा विवरण हाम्रो टिमले छोटो फोन कलमार्फत जानकारी गराउनेछ। त्यसका लागि कृपया आफ्नो मोबाइल नम्बर पठाउनुहोस् ताकि हामी तुरुन्त सम्पर्क गर्न सकौं।',
      'media', null
    ),
    jsonb_build_object(
      'delay_hours', 100,
      'message_hint', '३ दिनको विशेष अफर अन्तर्गत अहिले Free Delivery + 50% Discount उपलब्ध छ।' || E'\n\n' || 'यो अफर सीमित समयका लागि मात्र भएकाले अवसर नगुमाई आजै अर्डर गर्न अनुरोध गर्दछौं।' || E'\n\n' || 'पूरा विवरण पाउन तथा अर्डर कन्फर्म गर्न कृपया आफ्नो मोबाइल नम्बर पठाउनुहोस्।',
      'media', null
    )
  )
);

-- Schedule first followup for existing conversations where we already replied
-- but customer hasn't given lead yet (no lead-created tag), not completed,
-- and no followup currently scheduled.
UPDATE public.conversations c
SET ai_followup_step = 0,
    ai_followup_next_at = now() + interval '6 hours'
WHERE c.deleted_at IS NULL
  AND c.ai_followup_step IS NULL
  AND COALESCE(c.status, '') NOT IN ('completed')
  AND NOT (COALESCE(c.tags, ARRAY[]::text[]) && ARRAY['lead-created'])
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.conversation_id = c.id AND m.sender_type = 'page'
  );