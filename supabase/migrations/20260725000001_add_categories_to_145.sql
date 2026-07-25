-- Add 2 missing categories to reach 145 total
-- Then update display orders for all 145 to match alphabetical order

-- First add a unique constraint on name (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'categories_name_key'
  ) THEN
    ALTER TABLE public.categories ADD CONSTRAINT categories_name_key UNIQUE (name);
  END IF;
END $$;

-- Add 3D Modeling & Rendering (position 1, alphabetical)
INSERT INTO public.categories (name, slug, display_order)
VALUES ('3D Modeling & Rendering', '3d-modeling-rendering', 1)
ON CONFLICT (name) DO UPDATE SET display_order = EXCLUDED.display_order;

-- Add Accounting (position 2, alphabetical)  
INSERT INTO public.categories (name, slug, display_order)
VALUES ('Accounting', 'accounting', 2)
ON CONFLICT (name) DO UPDATE SET display_order = EXCLUDED.display_order;

-- Update all 145 display orders to match FALLBACK_CATEGORIES alphabetical order
UPDATE public.categories SET display_order = 1 WHERE name = '3D Modeling & Rendering';
UPDATE public.categories SET display_order = 2 WHERE name = 'Accounting';
UPDATE public.categories SET display_order = 3 WHERE name = 'Admin & Operations';
UPDATE public.categories SET display_order = 4 WHERE name = 'AI & Machine Learning';
UPDATE public.categories SET display_order = 5 WHERE name = 'Android Development';
UPDATE public.categories SET display_order = 6 WHERE name = 'API Development';
UPDATE public.categories SET display_order = 7 WHERE name = 'AR / VR Development';
UPDATE public.categories SET display_order = 8 WHERE name = 'Architecture Design';
UPDATE public.categories SET display_order = 9 WHERE name = 'Artificial Intelligence Chatbots';
UPDATE public.categories SET display_order = 10 WHERE name = 'Audio Editing';
UPDATE public.categories SET display_order = 11 WHERE name = 'Automation Testing';
UPDATE public.categories SET display_order = 12 WHERE name = 'Backend Development';
UPDATE public.categories SET display_order = 13 WHERE name = 'Blockchain Development';
UPDATE public.categories SET display_order = 14 WHERE name = 'Bookkeeping';
UPDATE public.categories SET display_order = 15 WHERE name = 'Brand Identity Design';
UPDATE public.categories SET display_order = 16 WHERE name = 'Business Analysis';
UPDATE public.categories SET display_order = 17 WHERE name = 'Business Consulting';
UPDATE public.categories SET display_order = 18 WHERE name = 'CAD Design';
UPDATE public.categories SET display_order = 19 WHERE name = 'Career Coaching';
UPDATE public.categories SET display_order = 20 WHERE name = 'Cloud Computing';
UPDATE public.categories SET display_order = 21 WHERE name = 'Community Management';
UPDATE public.categories SET display_order = 22 WHERE name = 'Compliance Consulting';
UPDATE public.categories SET display_order = 23 WHERE name = 'Consulting & Strategy';
UPDATE public.categories SET display_order = 24 WHERE name = 'Content Management';
UPDATE public.categories SET display_order = 25 WHERE name = 'Content Marketing';
UPDATE public.categories SET display_order = 26 WHERE name = 'Content Writing';
UPDATE public.categories SET display_order = 27 WHERE name = 'Copywriting';
UPDATE public.categories SET display_order = 28 WHERE name = 'CRM Management';
UPDATE public.categories SET display_order = 29 WHERE name = 'Cross Platform Development';
UPDATE public.categories SET display_order = 30 WHERE name = 'Customer Experience & UX Research';
UPDATE public.categories SET display_order = 31 WHERE name = 'Customer Support';
UPDATE public.categories SET display_order = 32 WHERE name = 'Cybersecurity';
UPDATE public.categories SET display_order = 33 WHERE name = 'Data Analytics';
UPDATE public.categories SET display_order = 34 WHERE name = 'Data Annotation';
UPDATE public.categories SET display_order = 35 WHERE name = 'Data Engineering';
UPDATE public.categories SET display_order = 36 WHERE name = 'Data Entry';
UPDATE public.categories SET display_order = 37 WHERE name = 'Data Science';
UPDATE public.categories SET display_order = 38 WHERE name = 'Database Administration';
UPDATE public.categories SET display_order = 39 WHERE name = 'Deep Learning';
UPDATE public.categories SET display_order = 40 WHERE name = 'Design & Creative';
UPDATE public.categories SET display_order = 41 WHERE name = 'Development & IT';
UPDATE public.categories SET display_order = 42 WHERE name = 'DevOps Engineering';
UPDATE public.categories SET display_order = 43 WHERE name = 'Digital Marketing';
UPDATE public.categories SET display_order = 44 WHERE name = 'E-commerce Management';
UPDATE public.categories SET display_order = 45 WHERE name = 'Education & Training';
UPDATE public.categories SET display_order = 46 WHERE name = 'Email Marketing';
UPDATE public.categories SET display_order = 47 WHERE name = 'Engineering & Architecture';
UPDATE public.categories SET display_order = 48 WHERE name = 'Engineering Design';
UPDATE public.categories SET display_order = 49 WHERE name = 'ERP Development';
UPDATE public.categories SET display_order = 50 WHERE name = 'Event Planning';
UPDATE public.categories SET display_order = 51 WHERE name = 'Excel Automation';
UPDATE public.categories SET display_order = 52 WHERE name = 'Finance & Accounting';
UPDATE public.categories SET display_order = 53 WHERE name = 'Financial Analysis';
UPDATE public.categories SET display_order = 54 WHERE name = 'Financial Planning';
UPDATE public.categories SET display_order = 55 WHERE name = 'Flutter Development';
UPDATE public.categories SET display_order = 56 WHERE name = 'Frontend Development';
UPDATE public.categories SET display_order = 57 WHERE name = 'Full Stack Development';
UPDATE public.categories SET display_order = 58 WHERE name = 'Game Development';
UPDATE public.categories SET display_order = 59 WHERE name = 'Gaming & eSports';
UPDATE public.categories SET display_order = 60 WHERE name = 'Generative AI';
UPDATE public.categories SET display_order = 61 WHERE name = 'Ghostwriting';
UPDATE public.categories SET display_order = 62 WHERE name = 'Google Ads Management';
UPDATE public.categories SET display_order = 63 WHERE name = 'Graphic Design';
UPDATE public.categories SET display_order = 64 WHERE name = 'Health & Wellness';
UPDATE public.categories SET display_order = 65 WHERE name = 'HR & Recruitment';
UPDATE public.categories SET display_order = 66 WHERE name = 'HR Consulting';
UPDATE public.categories SET display_order = 67 WHERE name = 'Illustration';
UPDATE public.categories SET display_order = 68 WHERE name = 'Influencer Marketing';
UPDATE public.categories SET display_order = 69 WHERE name = 'Interior Design';
UPDATE public.categories SET display_order = 70 WHERE name = 'Investment Analysis';
UPDATE public.categories SET display_order = 71 WHERE name = 'iOS Development';
UPDATE public.categories SET display_order = 72 WHERE name = 'IT Consulting';
UPDATE public.categories SET display_order = 73 WHERE name = 'Java Development';
UPDATE public.categories SET display_order = 74 WHERE name = 'Lead Generation';
UPDATE public.categories SET display_order = 75 WHERE name = 'Legal Consulting';
UPDATE public.categories SET display_order = 76 WHERE name = 'Legal Services';
UPDATE public.categories SET display_order = 77 WHERE name = 'Logo Design';
UPDATE public.categories SET display_order = 78 WHERE name = 'Machine Learning Engineering';
UPDATE public.categories SET display_order = 79 WHERE name = 'Marketing Automation';
UPDATE public.categories SET display_order = 80 WHERE name = 'Mechanical Design';
UPDATE public.categories SET display_order = 81 WHERE name = 'Meta Ads Management';
UPDATE public.categories SET display_order = 82 WHERE name = 'Mobile App Design';
UPDATE public.categories SET display_order = 83 WHERE name = 'Mobile App Development';
UPDATE public.categories SET display_order = 84 WHERE name = 'Motion Graphics';
UPDATE public.categories SET display_order = 85 WHERE name = 'Music & Audio';
UPDATE public.categories SET display_order = 86 WHERE name = 'Network Administration';
UPDATE public.categories SET display_order = 87 WHERE name = 'No-Code Development';
UPDATE public.categories SET display_order = 88 WHERE name = 'Online Tutoring';
UPDATE public.categories SET display_order = 89 WHERE name = 'Operations Management';
UPDATE public.categories SET display_order = 90 WHERE name = 'Payroll Management';
UPDATE public.categories SET display_order = 91 WHERE name = 'Performance Marketing';
UPDATE public.categories SET display_order = 92 WHERE name = 'Photography';
UPDATE public.categories SET display_order = 93 WHERE name = 'PPC Advertising';
UPDATE public.categories SET display_order = 94 WHERE name = 'Presentation Design';
UPDATE public.categories SET display_order = 95 WHERE name = 'Product Design';
UPDATE public.categories SET display_order = 96 WHERE name = 'Product Management';
UPDATE public.categories SET display_order = 97 WHERE name = 'Project Management';
UPDATE public.categories SET display_order = 98 WHERE name = 'Proofreading';
UPDATE public.categories SET display_order = 99 WHERE name = 'Python Development';
UPDATE public.categories SET display_order = 100 WHERE name = 'QA Testing';
UPDATE public.categories SET display_order = 101 WHERE name = 'React Development';
UPDATE public.categories SET display_order = 102 WHERE name = 'React Native Development';
UPDATE public.categories SET display_order = 103 WHERE name = 'Real Estate';
UPDATE public.categories SET display_order = 104 WHERE name = 'Recruitment Services';
UPDATE public.categories SET display_order = 105 WHERE name = 'Research Assistance';
UPDATE public.categories SET display_order = 106 WHERE name = 'Resume Writing';
UPDATE public.categories SET display_order = 107 WHERE name = 'Robotic Process Automation';
UPDATE public.categories SET display_order = 108 WHERE name = 'Sales & Customer Support';
UPDATE public.categories SET display_order = 109 WHERE name = 'Sales Consulting';
UPDATE public.categories SET display_order = 110 WHERE name = 'Science & Research';
UPDATE public.categories SET display_order = 111 WHERE name = 'Script Writing';
UPDATE public.categories SET display_order = 112 WHERE name = 'Search Engine Optimization';
UPDATE public.categories SET display_order = 113 WHERE name = 'SEM Management';
UPDATE public.categories SET display_order = 114 WHERE name = 'Shopify Development';
UPDATE public.categories SET display_order = 115 WHERE name = 'Social Media Management';
UPDATE public.categories SET display_order = 116 WHERE name = 'Social Media Marketing';
UPDATE public.categories SET display_order = 117 WHERE name = 'Software Architecture';
UPDATE public.categories SET display_order = 118 WHERE name = 'Software Development';
UPDATE public.categories SET display_order = 119 WHERE name = 'SQL Development';
UPDATE public.categories SET display_order = 120 WHERE name = 'Supply Chain & Logistics';
UPDATE public.categories SET display_order = 121 WHERE name = 'Sustainability & Green Tech';
UPDATE public.categories SET display_order = 122 WHERE name = 'Technical Support';
UPDATE public.categories SET display_order = 123 WHERE name = 'Technical Writing';
UPDATE public.categories SET display_order = 124 WHERE name = 'Telecalling';
UPDATE public.categories SET display_order = 125 WHERE name = 'Trademark Registration';
UPDATE public.categories SET display_order = 126 WHERE name = 'Trades & Services';
UPDATE public.categories SET display_order = 127 WHERE name = 'Translation Services';
UPDATE public.categories SET display_order = 128 WHERE name = 'Travel & Hospitality';
UPDATE public.categories SET display_order = 129 WHERE name = 'UI Design';
UPDATE public.categories SET display_order = 130 WHERE name = 'UI/UX Design';
UPDATE public.categories SET display_order = 131 WHERE name = 'User Research';
UPDATE public.categories SET display_order = 132 WHERE name = 'UX Writing';
UPDATE public.categories SET display_order = 133 WHERE name = 'Video & Animation';
UPDATE public.categories SET display_order = 134 WHERE name = 'Video Editing';
UPDATE public.categories SET display_order = 135 WHERE name = 'Virtual Assistance';
UPDATE public.categories SET display_order = 136 WHERE name = 'Voice Over Services';
UPDATE public.categories SET display_order = 137 WHERE name = 'Vue.js Development';
UPDATE public.categories SET display_order = 138 WHERE name = 'Web Design';
UPDATE public.categories SET display_order = 139 WHERE name = 'Web Development';
UPDATE public.categories SET display_order = 140 WHERE name = 'Webflow Development';
UPDATE public.categories SET display_order = 141 WHERE name = 'Website Maintenance';
UPDATE public.categories SET display_order = 142 WHERE name = 'WordPress Development';
UPDATE public.categories SET display_order = 143 WHERE name = 'Writing & Editing';
UPDATE public.categories SET display_order = 144 WHERE name = 'Writing & Translation';
UPDATE public.categories SET display_order = 145 WHERE name = 'YouTube Management';
