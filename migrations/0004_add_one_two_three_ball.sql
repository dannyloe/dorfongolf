ALTER TABLE event_matches ADD COLUMN IF NOT EXISTS one_two_three_ball_one_ball_bet integer;
ALTER TABLE event_matches ADD COLUMN IF NOT EXISTS one_two_three_ball_two_third_ball_bet integer;
ALTER TABLE event_matches ADD COLUMN IF NOT EXISTS auto_press_one_ball_front9 boolean NOT NULL DEFAULT true;
ALTER TABLE event_matches ADD COLUMN IF NOT EXISTS auto_press_one_ball_back9 boolean NOT NULL DEFAULT true;
ALTER TABLE event_matches ADD COLUMN IF NOT EXISTS auto_press_one_ball_overall boolean NOT NULL DEFAULT true;
ALTER TABLE event_matches ADD COLUMN IF NOT EXISTS auto_press_two_third_ball_front9 boolean NOT NULL DEFAULT true;
ALTER TABLE event_matches ADD COLUMN IF NOT EXISTS auto_press_two_third_ball_back9 boolean NOT NULL DEFAULT true;
ALTER TABLE event_matches ADD COLUMN IF NOT EXISTS auto_press_two_third_ball_overall boolean NOT NULL DEFAULT true;
