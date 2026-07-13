# SECURITY DEFINER follow-up

Public function execution and `SECURITY DEFINER` ownership/search-path behavior were intentionally not changed by the public-table RLS/ACL repair. Review each public function against its runtime callers and restrict execution only with evidence for those contracts; storage and trigger behavior must remain unchanged until that review is complete.
