-- Contests table
CREATE TABLE IF NOT EXISTS contests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  prize_amount NUMERIC(10,2) NOT NULL,
  second_prize NUMERIC(10,2) DEFAULT 0,
  third_prize NUMERIC(10,2) DEFAULT 0,
  skills_required TEXT[] DEFAULT '{}',
  contest_type TEXT NOT NULL DEFAULT 'design' CHECK (contest_type IN ('design', 'development', 'writing', 'marketing', 'other')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'judging', 'completed', 'cancelled')),
  start_date TIMESTAMPTZ DEFAULT now(),
  end_date TIMESTAMPTZ NOT NULL,
  max_submissions INTEGER DEFAULT 0,
  submission_count INTEGER DEFAULT 0,
  winner_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Contest submissions table
CREATE TABLE IF NOT EXISTS contest_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contest_id UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  freelancer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT,
  file_type TEXT,
  preview_url TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'shortlisted', 'winner', 'rejected')),
  rank INTEGER,
  prize_amount NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(contest_id, freelancer_id)
);

-- Contest votes table
CREATE TABLE IF NOT EXISTS contest_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES contest_submissions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(submission_id, user_id)
);

-- Contest comments table
CREATE TABLE IF NOT EXISTS contest_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contest_id UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  parent_id UUID REFERENCES contest_comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contests_client_id ON contests(client_id);
CREATE INDEX IF NOT EXISTS idx_contests_status ON contests(status);
CREATE INDEX IF NOT EXISTS idx_contests_end_date ON contests(end_date);
CREATE INDEX IF NOT EXISTS idx_contests_category ON contests(category);
CREATE INDEX IF NOT EXISTS idx_contest_submissions_contest_id ON contest_submissions(contest_id);
CREATE INDEX IF NOT EXISTS idx_contest_submissions_freelancer_id ON contest_submissions(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_contest_votes_submission_id ON contest_votes(submission_id);
CREATE INDEX IF NOT EXISTS idx_contest_comments_contest_id ON contest_comments(contest_id);

-- Enable RLS
ALTER TABLE contests ENABLE ROW LEVEL SECURITY;
ALTER TABLE contest_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contest_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE contest_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contests
CREATE POLICY "Contests are viewable by everyone" ON contests
  FOR SELECT USING (true);

CREATE POLICY "Clients can create contests" ON contests
  FOR INSERT WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Clients can update their own contests" ON contests
  FOR UPDATE USING (auth.uid() = client_id);

CREATE POLICY "Clients can delete their own contests" ON contests
  FOR DELETE USING (auth.uid() = client_id);

-- RLS Policies for contest_submissions
CREATE POLICY "Submissions are viewable by contest owner and submitter" ON contest_submissions
  FOR SELECT USING (
    auth.uid() = freelancer_id OR 
    auth.uid() = (SELECT client_id FROM contests WHERE id = contest_id)
  );

CREATE POLICY "Freelancers can submit to active contests" ON contest_submissions
  FOR INSERT WITH CHECK (
    auth.uid() = freelancer_id AND
    (SELECT status FROM contests WHERE id = contest_id) = 'active' AND
    (SELECT end_date FROM contests WHERE id = contest_id) > now()
  );

CREATE POLICY "Freelancers can update their own submissions" ON contest_submissions
  FOR UPDATE USING (auth.uid() = freelancer_id);

CREATE POLICY "Contest owners can update submission status" ON contest_submissions
  FOR UPDATE USING (
    auth.uid() = (SELECT client_id FROM contests WHERE id = contest_id)
  );

-- RLS Policies for contest_votes
CREATE POLICY "Votes are viewable by everyone" ON contest_votes
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can vote" ON contest_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own votes" ON contest_votes
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for contest_comments
CREATE POLICY "Comments are viewable by everyone" ON contest_comments
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can comment" ON contest_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own comments" ON contest_comments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments" ON contest_comments
  FOR DELETE USING (auth.uid() = user_id);

-- Function to update submission count
CREATE OR REPLACE FUNCTION update_contest_submission_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE contests SET submission_count = submission_count + 1 WHERE id = NEW.contest_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE contests SET submission_count = submission_count - 1 WHERE id = OLD.contest_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-update submission count
CREATE TRIGGER on_contest_submission_change
  AFTER INSERT OR DELETE ON contest_submissions
  FOR EACH ROW EXECUTE FUNCTION update_contest_submission_count();

-- Function to auto-close expired contests
CREATE OR REPLACE FUNCTION close_expired_contests()
RETURNS void AS $$
BEGIN
  UPDATE contests 
  SET status = 'judging', updated_at = now()
  WHERE status = 'active' AND end_date < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
