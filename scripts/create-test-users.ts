// Create test users for end-to-end testing
// Run with: npx tsx scripts/create-test-users.ts
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://zttwsjehcgaicziqyxpq.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.error('Run: SUPABASE_SERVICE_ROLE_KEY=your_key npx tsx scripts/create-test-users.ts');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function createTestUser(
  email: string,
  password: string,
  name: string,
  role: 'freelancer' | 'client',
  extraProfile: Record<string, unknown> = {}
) {
  console.log(`\n--- Creating ${role}: ${name} (${email}) ---`);

  // Step 1: Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role },
  });

  if (authError) {
    if (authError.message.includes('already exists')) {
      console.log(`  User ${email} already exists, fetching...`);
      const { data: existing } = await supabase.auth.admin.listUsers();
      const user = existing?.users?.find(u => u.email === email);
      if (user) {
        console.log(`  Found existing user: ${user.id}`);
        return { userId: user.id, email, name, role };
      }
      throw authError;
    }
    throw authError;
  }

  if (!authData?.user?.id) throw new Error('No user ID returned');

  const userId = authData.user.id;
  console.log(`  Auth user created: ${userId}`);

  // Step 2: Create/update profile
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: userId,
    email,
    name,
    role,
    onboarding_completed: true,
  } as any);

  if (profileError) {
    console.error(`  Profile error: ${profileError.message}`);
  } else {
    console.log(`  Profile created for ${role}`);
  }

  // Step 3: Create role-specific profile data
  if (role === 'freelancer') {
    const { error: fpError } = await supabase.from('freelancer_profiles').upsert({
      user_id: userId,
      title: extraProfile.title || 'Full Stack Developer',
      bio: extraProfile.bio || 'Experienced developer with 5+ years in web development. Passionate about building scalable applications.',
      hourly_rate: extraProfile.hourly_rate || 50,
      skills: extraProfile.skills || ['JavaScript', 'React', 'Node.js', 'TypeScript', 'PostgreSQL'],
      experience: extraProfile.experience || 5,
      location: extraProfile.location || 'San Francisco, CA',
      portfolio_url: extraProfile.portfolio_url || 'https://github.com/testuser',
      availability: true,
      languages: extraProfile.languages || ['English', 'Spanish'],
    } as any);

    if (fpError) {
      console.error(`  Freelancer profile error: ${fpError.message}`);
    } else {
      console.log(`  Freelancer profile created with skills, rate, bio, location`);
    }
  } else if (role === 'client') {
    const { error: cpError } = await supabase.from('client_profiles').upsert({
      user_id: userId,
      company_name: extraProfile.company_name || 'Test Company Inc.',
      description: extraProfile.description || 'A software company looking for top freelance talent.',
      location: extraProfile.location || 'New York, NY',
    } as any);

    if (cpError) {
      console.error(`  Client profile error: ${cpError.message}`);
    } else {
      console.log(`  Client profile created with company info`);
    }
  }

  return { userId, email, name, role };
}

async function setupTestProject(clientId: string, clientName: string) {
  console.log(`\n--- Creating test project for ${clientName} ---`);

  const { data, error } = await supabase.from('projects').insert({
    client_id: clientId,
    title: 'E-commerce Dashboard Redesign',
    description: 'We need an experienced developer to redesign our e-commerce analytics dashboard. Must have experience with React, D3.js, and real-time data visualization.',
    budget_min: 5000,
    budget_max: 8000,
    category: 'Web Development',
    skills_required: ['React', 'TypeScript', 'D3.js', 'Node.js'],
    experience_level: 'intermediate',
    status: 'open',
    visibility: 'public',
  } as any).select().single();

  if (error) {
    console.error(`  Project creation error: ${error.message}`);
  } else {
    console.log(`  Test project created: ${data?.id}`);
  }
}

async function main() {
  try {
    // Create test freelancer
    const freelancer = await createTestUser(
      'test-freelancer-demo@growlancer.test',
      'DemoTest123!',
      'Demo Freelancer',
      'freelancer',
      {
        title: 'Senior Full Stack Developer',
        bio: 'Senior full-stack developer with 7+ years of experience building web applications using React, Node.js, and PostgreSQL. I specialize in building scalable SaaS platforms and have completed 50+ projects on various freelancing platforms.',
        hourly_rate: 75,
        skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Python', 'AWS', 'GraphQL'],
        experience: 7,
        location: 'Austin, TX',
        portfolio_url: 'https://github.com/demo-freelancer',
        languages: ['English', 'French'],
      }
    );

    // Create test client
    const client = await createTestUser(
      'test-client-demo@growlancer.test',
      'DemoTest123!',
      'Demo Client',
      'client',
      {
        company_name: 'TechStartup Inc.',
        description: 'TechStartup Inc. is a Series B funded company building next-generation AI-powered analytics tools for e-commerce businesses. We are looking for top freelance talent to help us scale our platform.',
        location: 'San Francisco, CA',
      }
    );

    // Create a test project for the client
    await setupTestProject(client.userId, client.name);

    console.log('\n========================================');
    console.log('✅ TEST USERS CREATED SUCCESSFULLY');
    console.log('========================================');
    console.log('\n📧 FREELANCER:');
    console.log('   Email: test-freelancer-demo@growlancer.test');
    console.log('   Password: DemoTest123!');
    console.log('   ID:', freelancer.userId);
    console.log('\n📧 CLIENT:');
    console.log('   Email: test-client-demo@growlancer.test');
    console.log('   Password: DemoTest123!');
    console.log('   ID:', client.userId);
    console.log('\n🔗 Login URL: http://localhost:5173/?modal=login');
    console.log('========================================\n');

  } catch (error) {
    console.error('\n❌ Error creating test users:', error);
    process.exit(1);
  }
}

main();
