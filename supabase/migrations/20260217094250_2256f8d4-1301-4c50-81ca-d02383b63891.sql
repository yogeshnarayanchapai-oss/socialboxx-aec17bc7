
-- Allow team members with edit access to update connected pages
CREATE POLICY "Team members with edit access can update pages"
ON public.connected_pages
FOR UPDATE
USING (
  organization_id = get_user_org_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.team_page_access
    WHERE team_page_access.user_id = auth.uid()
      AND team_page_access.page_id = connected_pages.id
      AND team_page_access.access_level = 'edit'
  )
);
